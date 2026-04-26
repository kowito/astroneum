import { registerIndicator } from '@/engine/extension/indicator/index'
import { INDICATOR_PLUGIN_RUNTIME_KEY } from '@/constants'

export { INDICATOR_PLUGIN_RUNTIME_KEY }

import type { IndicatorTemplate } from '@/engine/component/Indicator'
import type { CandleData } from '@/engine'

import type { ChartPlugin, ChartPluginContext, IndicatorPlugin, Price, Timestamp, Viewport, Chart } from '@/types'

const DEFAULT_FIGURE_KEY = 'value'
const MAX_FIGURE_KEYS = 16

type IndicatorPluginRuntimeData = {
  output: unknown[]
  renderGL: null | (
    (gl: WebGL2RenderingContext, output: unknown[], viewport: Viewport, vbo: WebGLBuffer) => void
  )
}

type NormalizedIndicatorRow = Record<string, number | null>

function isFiniteNumber (value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function clamp (value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizeIndicatorRow (value: unknown): NormalizedIndicatorRow {
  if (isFiniteNumber(value)) {
    return { [DEFAULT_FIGURE_KEY]: value }
  }

  if (value !== null && typeof value === 'object') {
    const normalized: NormalizedIndicatorRow = {}
    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
      normalized[key] = isFiniteNumber(entry) ? entry : null
    })
    if (Object.keys(normalized).length > 0) {
      return normalized
    }
  }

  return { [DEFAULT_FIGURE_KEY]: null }
}

function normalizeIndicatorOutput<TOutput> (
  rawOutput: readonly TOutput[],
  targetLength: number
): NormalizedIndicatorRow[] {
  const rows = new Array<NormalizedIndicatorRow>(targetLength)
  for (let index = 0; index < targetLength; index++) {
    rows[index] = normalizeIndicatorRow(rawOutput[index])
  }
  return rows
}

function extractFigureKeys (rows: readonly NormalizedIndicatorRow[]): string[] {
  const keys: string[] = []
  const keySet = new Set<string>()

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!keySet.has(key)) {
        keySet.add(key)
        keys.push(key)
        if (keys.length >= MAX_FIGURE_KEYS) {
          return keys
        }
      }
    }
  }

  if (keys.length === 0) {
    return [DEFAULT_FIGURE_KEY]
  }
  return keys
}

function hasSameKeys (left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false
  }
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) {
      return false
    }
  }
  return true
}

function createFigures (keys: readonly string[]): Array<{ key: string, title: string, type: 'line' }> {
  return keys.map(key => {
    const text = key === DEFAULT_FIGURE_KEY ? 'Value' : key
    return {
      key,
      title: `${text}: `,
      type: 'line'
    }
  })
}

function buildViewport (
  dataList: CandleData[],
  visibleRange: { realFrom: number, realTo: number },
  priceRange: { realFrom: number, realTo: number },
  width: number,
  height: number
): Viewport {
  const priceMin = Math.min(priceRange.realFrom, priceRange.realTo) as Price
  const priceMax = Math.max(priceRange.realFrom, priceRange.realTo) as Price

  if (dataList.length === 0) {
    return {
      priceMin,
      priceMax,
      timeMin: 0 as Timestamp,
      timeMax: 0 as Timestamp,
      resolution: [width, height]
    }
  }

  const maxIndex = dataList.length - 1
  const fromIndex = clamp(Math.floor(visibleRange.realFrom), 0, maxIndex)
  const toExclusive = clamp(Math.ceil(visibleRange.realTo), 1, dataList.length)
  const toIndex = clamp(toExclusive - 1, fromIndex, maxIndex)

  const firstTimestamp = Number(dataList[fromIndex]?.timestamp ?? 0)
  const lastTimestamp = Number(dataList[toIndex]?.timestamp ?? firstTimestamp)

  return {
    priceMin,
    priceMax,
    timeMin: Math.min(firstTimestamp, lastTimestamp) as Timestamp,
    timeMax: Math.max(firstTimestamp, lastTimestamp) as Timestamp,
    resolution: [width, height]
  }
}

function getIndicatorRuntimeData (indicator: { extendData?: unknown }): IndicatorPluginRuntimeData | null {
  if (indicator.extendData === null || typeof indicator.extendData !== 'object') {
    return null
  }

  const runtimeData = (indicator.extendData as Record<string, unknown>)[INDICATOR_PLUGIN_RUNTIME_KEY]
  if (runtimeData === null || typeof runtimeData !== 'object') {
    return null
  }

  return runtimeData as IndicatorPluginRuntimeData
}

export function createIndicatorTemplateFromPlugin<TOutput> (
  plugin: IndicatorPlugin<TOutput>
): IndicatorTemplate<NormalizedIndicatorRow, number> {
  let figureKeys: string[] = [DEFAULT_FIGURE_KEY]

  const render2D = plugin.render2D === undefined
    ? null
    : (ctx: CanvasRenderingContext2D, output: TOutput[], viewport: Viewport): void => {
        plugin.render2D?.(ctx, output, viewport)
      }

  const renderGL = plugin.renderGL === undefined
    ? null
    : (gl: WebGL2RenderingContext, output: TOutput[], viewport: Viewport, vbo: WebGLBuffer): void => {
        plugin.renderGL?.(gl, output, viewport, vbo)
      }

  const template: IndicatorTemplate<NormalizedIndicatorRow, number> = {
    name: plugin.name,
    shortName: plugin.shortName ?? plugin.name,
    calcParams: [...(plugin.calcParams ?? [])],
    figures: createFigures(figureKeys),
    extendData: {
      [INDICATOR_PLUGIN_RUNTIME_KEY]: {
        output: [],
        renderGL
      }
    },
    calc (dataList, indicator) {
      const rawOutput = plugin.calc(dataList, indicator.calcParams)
      const latestOutput = Array.isArray(rawOutput) ? rawOutput : []

      const runtimeData = getIndicatorRuntimeData(indicator)
      if (runtimeData !== null) {
        runtimeData.output = latestOutput
      }

      const normalizedRows = normalizeIndicatorOutput(latestOutput, dataList.length)
      const nextKeys = extractFigureKeys(normalizedRows)
      if (!hasSameKeys(figureKeys, nextKeys)) {
        figureKeys = nextKeys
        indicator.figures = createFigures(figureKeys)
      }
      return normalizedRows
    }
  }

  if (render2D) {
    template.draw = ({ ctx, chart, indicator, yAxis, bounding }) => {
      const runtimeData = getIndicatorRuntimeData(indicator)
      const output = runtimeData !== null ? (runtimeData.output as TOutput[]) : []
      const viewport = buildViewport(
        chart.getDataList(),
        chart.getVisibleRange(),
        yAxis.getRange(),
        Math.max(1, Math.floor(bounding.width)),
        Math.max(1, Math.floor(bounding.height))
      )
      render2D(ctx, output, viewport)
      return true
    }
  }

  return template
}

export function registerIndicatorPlugin<TOutput> (plugin: IndicatorPlugin<TOutput>): void {
  registerIndicator(createIndicatorTemplateFromPlugin(plugin))
}

export function registerIndicatorPlugins (plugins: ReadonlyArray<IndicatorPlugin<unknown>>): void {
  plugins.forEach(plugin => {
    registerIndicatorPlugin(plugin)
  })
}

export function mountChartPlugins (chart: Chart, plugins: ReadonlyArray<ChartPlugin>): () => void {
  const disposeList: Array<() => void> = []

  plugins.forEach(plugin => {
    if (plugin.indicators && plugin.indicators.length > 0) {
      registerIndicatorPlugins(plugin.indicators)
    }

    if (plugin.onInit) {
      const context: ChartPluginContext = {
        chart,
        registerIndicatorPlugin,
        registerIndicatorPlugins
      }
      const maybeDispose = plugin.onInit(context)
      if (typeof maybeDispose === 'function') {
        disposeList.push(maybeDispose)
      }
    }
  })

  return () => {
    for (let index = disposeList.length - 1; index >= 0; index--) {
      disposeList[index]()
    }
  }
}
