import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Indicator } from '../engine/component/Indicator'
import { getIndicatorClass } from '../engine/extension/indicator/index'
import { createIndicatorTemplateFromPlugin, mountChartPlugins, registerIndicatorPlugin } from '../plugin'
import type { CandleData, Chart, ChartPlugin } from '../types'

const CANDLES: CandleData[] = [
  { timestamp: 1, open: 10, high: 13, low: 9, close: 12, volume: 100 },
  { timestamp: 2, open: 12, high: 15, low: 11, close: 14, volume: 120 },
  { timestamp: 3, open: 14, high: 16, low: 13, close: 15, volume: 110 }
]

describe('createIndicatorTemplateFromPlugin', () => {
  it('normalizes scalar plugin output to engine rows', async () => {
    const template = createIndicatorTemplateFromPlugin({
      name: 'UNIT_SCALAR_PLUGIN',
      calc (dataList) {
        return dataList.map(candle => candle.close - candle.open)
      }
    })

    const indicator = {
      calcParams: [],
      figures: []
    } as unknown as Indicator<Record<string, number | null>, number>

    const rows = await Promise.resolve(template.calc(CANDLES, indicator))
    assert.equal(rows.length, CANDLES.length)
    assert.equal(rows[0].value, 2)
    assert.equal(rows[1].value, 2)
    assert.ok(Array.isArray(template.figures) && template.figures.length > 0)
    assert.equal(template.figures[0]?.key, 'value')
  })

  it('registers adapted plugin in engine indicator registry', () => {
    const name = `UNIT_REG_PLUGIN_${Date.now()}`
    registerIndicatorPlugin({
      name,
      calc (dataList) {
        return dataList.map(candle => ({ spread: candle.high - candle.low }))
      }
    })

    assert.notEqual(getIndicatorClass(name), null)
  })

  it('mounts chart plugins and runs plugin disposer on unmount', () => {
    const name = `UNIT_MOUNT_PLUGIN_${Date.now()}`
    const chart = {} as Chart
    let initCalled = false
    let cleanupCalled = false

    const plugins: ChartPlugin[] = [
      {
        name: 'unit-mount',
        indicators: [
          {
            name,
            calc (dataList) {
              return dataList.map(candle => candle.close)
            }
          }
        ],
        onInit (context) {
          initCalled = context.chart === chart
          return () => {
            cleanupCalled = true
          }
        }
      }
    ]

    const unmount = mountChartPlugins(chart, plugins)
    assert.equal(initCalled, true)
    assert.notEqual(getIndicatorClass(name), null)

    unmount()
    assert.equal(cleanupCalled, true)
  })

  it('keeps render hook output isolated per indicator instance', async () => {
    const name = `UNIT_RUNTIME_ISO_PLUGIN_${Date.now()}`
    const renderedOutputs: number[][] = []

    const template = createIndicatorTemplateFromPlugin<number>({
      name,
      calc (dataList, calcParams) {
        const offset = Number(calcParams[0] ?? 0)
        return dataList.map(candle => candle.close + offset)
      },
      render2D (_ctx, output) {
        renderedOutputs.push([...output])
      }
    })

    const createIndicatorInstance = (offset: number): Indicator<Record<string, number | null>, number> => {
      const extendData = JSON.parse(JSON.stringify(template.extendData ?? {})) as unknown
      return {
        calcParams: [offset],
        figures: [...(template.figures ?? [])],
        extendData
      } as unknown as Indicator<Record<string, number | null>, number>
    }

    const first = createIndicatorInstance(0)
    const second = createIndicatorInstance(100)

    await Promise.resolve(template.calc(CANDLES, first))
    await Promise.resolve(template.calc(CANDLES, second))

    const drawArgs = {
      ctx: {} as CanvasRenderingContext2D,
      chart: {
        getDataList: () => CANDLES,
        getVisibleRange: () => ({ realFrom: 0, realTo: CANDLES.length })
      } as unknown as Chart,
      xAxis: {} as never,
      yAxis: {
        getRange: () => ({ realFrom: 0, realTo: 1000 })
      } as never,
      bounding: {
        width: 600,
        height: 320
      } as never
    }

    template.draw?.({
      ...drawArgs,
      indicator: first
    })
    template.draw?.({
      ...drawArgs,
      indicator: second
    })

    assert.equal(renderedOutputs.length, 2)
    assert.deepEqual(renderedOutputs[0], [12, 14, 15])
    assert.deepEqual(renderedOutputs[1], [112, 114, 115])
  })
})
