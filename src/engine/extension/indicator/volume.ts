// @ts-nocheck

import { formatValue } from '../../common/utils/format'
import { isValid } from '../../common/utils/typeChecks'

import type { IndicatorTemplate, IndicatorFigure } from '../../component/Indicator'

interface Vol {
  open: number
  close: number
  volume?: number
  ma1?: number
  ma2?: number
  ma3?: number
}

function toOpaqueColor (color: string): string {
  const rgbaMatch = color.match(/^rgba\(([^)]+)\)$/i)
  if (rgbaMatch === null) return color
  const channels = rgbaMatch[1].split(',').map(v => v.trim())
  if (channels.length < 3) return color
  return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, 1)`
}

function getVolumeFigure (): IndicatorFigure<Vol> {
  return {
    key: 'volume',
    title: 'VOLUME: ',
    type: 'bar',
    baseValue: 0,
    attrs: ({ coordinate, barSpace, yAxis }) => {
      const valueY = coordinate.current.volume
      if (!isValid(valueY)) return null

      // Match candlestick body width calculation for visual alignment.
      const correction = barSpace.gapBar % 2 === 0 ? 1 : 0
      const baselineY = yAxis.convertToPixel(yAxis.getRange().from)
      const x = coordinate.current.x - barSpace.halfGapBar
      const width = barSpace.gapBar + correction
      const y = Math.min(valueY, baselineY)
      const height = Math.max(1, Math.abs(baselineY - valueY))
      return { x, y, width, height }
    },
    styles: ({ data, indicator, defaultStyles }) => {
      const current = data.current
      let color = formatValue(indicator.styles, 'bars[0].noChangeColor', (defaultStyles!.bars)[0].noChangeColor)
      if (isValid(current)) {
        if (current.close > current.open) {
          color = formatValue(indicator.styles, 'bars[0].upColor', (defaultStyles!.bars)[0].upColor)
        } else if (current.close < current.open) {
          color = formatValue(indicator.styles, 'bars[0].downColor', (defaultStyles!.bars)[0].downColor)
        }
      }
      return { color: toOpaqueColor(color as string) }
    }
  }
}

const volume: IndicatorTemplate<Vol, number> = {
  name: 'VOL',
  shortName: 'VOL',
  series: 'volume',
  calcParams: [7, 25, 99],
  shouldFormatBigNumber: true,
  precision: 0,
  minValue: 0,
  figures: [
    { key: 'ma1', title: 'MA5: ', type: 'line' },
    { key: 'ma2', title: 'MA10: ', type: 'line' },
    { key: 'ma3', title: 'MA20: ', type: 'line' },
    getVolumeFigure()
  ],
  regenerateFigures: (params) => {
    const figures: Array<IndicatorFigure<Vol>> = params.map((p, i) => ({ key: `ma${i + 1}`, title: `MA${p}: `, type: 'line' }))
    figures.push(getVolumeFigure())
    return figures
  },
  calc: (dataList, indicator) => {
    const { calcParams: params, figures } = indicator
    const volSums: number[] = []
    return dataList.map((candleData, i) => {
      const volume = candleData.volume ?? 0
      const vol: Vol = { volume, open: candleData.open, close: candleData.close }
      params.forEach((p, index) => {
        volSums[index] = (volSums[index] ?? 0) + volume
        if (i >= p - 1) {
          vol[figures[index].key] = volSums[index] / p
          volSums[index] -= (dataList[i - (p - 1)].volume ?? 0)
        }
      })
      return vol
    })
  }
}

export default volume
