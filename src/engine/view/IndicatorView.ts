// @ts-nocheck

import type Nullable from '../common/Nullable'
import type { CandleColorCompareRule, SmoothLineStyle } from '../common/Styles'
import { formatValue } from '../common/utils/format'
import { logWarn } from '../common/utils/logger'
import { isFunction, isNumber, isValid } from '../common/utils/typeChecks'
import type Coordinate from '../common/Coordinate'
import { INDICATOR_PLUGIN_RUNTIME_KEY } from '../../constants'

import { eachFigures, type IndicatorFigure, type IndicatorFigureAttrs, type IndicatorFigureStyle } from '../component/Indicator'
import { getLineRenderer, getOrCreateLineRenderer, type LineSegmentData, getOrCreateSharedIndicatorGLCanvas, getSharedIndicatorGLCanvas } from '../common/IndicatorLineWebGLRenderer'
import { getIndicatorPluginRenderer, getOrCreateIndicatorPluginRenderer } from '../common/IndicatorPluginWebGLRenderer'
import { getOrCreateRectRenderer, getRectRenderer, isGpuRectEligible, type RectInstanceData } from '../common/IndicatorRectWebGLRenderer'

import CandleBarView, { type CandleBarOptions } from './CandleBarView'

type IndicatorPluginRuntimeData = {
  output?: unknown[]
  renderGL?: ((
    gl: WebGL2RenderingContext,
    output: unknown[],
    viewport: {
      priceMin: number
      priceMax: number
      timeMin: number
      timeMax: number
      resolution: [number, number]
    },
    vbo: WebGLBuffer
  ) => void) | null
}

function getPluginRuntimeData (indicator: { extendData?: unknown }): IndicatorPluginRuntimeData | null {
  if (indicator.extendData === null || typeof indicator.extendData !== 'object') {
    return null
  }
  const runtimeData = (indicator.extendData as Record<string, unknown>)[INDICATOR_PLUGIN_RUNTIME_KEY]
  if (runtimeData === null || typeof runtimeData !== 'object') {
    return null
  }
  return runtimeData as IndicatorPluginRuntimeData
}

function createPluginViewport (
  chart: {
    getDataList: () => Array<{ timestamp?: number }>
    getVisibleRange: () => { realFrom: number, realTo: number }
  },
  yAxis: { getRange: () => { realFrom: number, realTo: number } },
  bounding: { width: number, height: number }
): {
    priceMin: number
    priceMax: number
    timeMin: number
    timeMax: number
    resolution: [number, number]
  } {
  const dataList = chart.getDataList()
  const visibleRange = chart.getVisibleRange()
  const priceRange = yAxis.getRange()
  const width = Math.max(1, Math.floor(bounding.width))
  const height = Math.max(1, Math.floor(bounding.height))

  const priceMin = Math.min(priceRange.realFrom, priceRange.realTo)
  const priceMax = Math.max(priceRange.realFrom, priceRange.realTo)

  if (dataList.length === 0) {
    return {
      priceMin,
      priceMax,
      timeMin: 0,
      timeMax: 0,
      resolution: [width, height]
    }
  }

  const maxIndex = dataList.length - 1
  const fromIndex = Math.min(maxIndex, Math.max(0, Math.floor(visibleRange.realFrom)))
  const toExclusive = Math.min(dataList.length, Math.max(1, Math.ceil(visibleRange.realTo)))
  const toIndex = Math.min(maxIndex, Math.max(fromIndex, toExclusive - 1))

  const firstTimestamp = Number(dataList[fromIndex]?.timestamp ?? 0)
  const lastTimestamp = Number(dataList[toIndex]?.timestamp ?? firstTimestamp)

  return {
    priceMin,
    priceMax,
    timeMin: Math.min(firstTimestamp, lastTimestamp),
    timeMax: Math.max(firstTimestamp, lastTimestamp),
    resolution: [width, height]
  }
}

export default class IndicatorView extends CandleBarView {
  override getCandleBarOptions (): Nullable<CandleBarOptions> {
    const pane = this.getWidget().getPane()
    const yAxis = pane.getAxisComponent()
    if (!yAxis.isInCandle()) {
      const chartStore = pane.getChart().getChartStore()
      const indicators = chartStore.getIndicatorsByPaneId(pane.getId())
      for (const indicator of indicators) {
        if (indicator.shouldOhlc && indicator.visible) {
          const indicatorStyles = indicator.styles
          const defaultStyles = chartStore.getStyles().indicator
          const compareRule = formatValue(indicatorStyles, 'ohlc.compareRule', defaultStyles.ohlc.compareRule) as CandleColorCompareRule
          const upColor = formatValue(indicatorStyles, 'ohlc.upColor', defaultStyles.ohlc.upColor) as string
          const downColor = formatValue(indicatorStyles, 'ohlc.downColor', defaultStyles.ohlc.downColor) as string
          const noChangeColor = formatValue(indicatorStyles, 'ohlc.noChangeColor', defaultStyles.ohlc.noChangeColor) as string
          return {
            type: 'ohlc',
            styles: {
              compareRule,
              upColor,
              downColor,
              noChangeColor,
              upBorderColor: upColor,
              downBorderColor: downColor,
              noChangeBorderColor: noChangeColor,
              upWickColor: upColor,
              downWickColor: downColor,
              noChangeWickColor: noChangeColor
            }
          }
        }
      }
    }
    return null
  }

  override drawImp (ctx: CanvasRenderingContext2D): void {
    super.drawImp(ctx)
    const widget = this.getWidget()
    const pane = widget.getPane()
    const chart = pane.getChart()
    const bounding = widget.getBounding()
    const xAxis = chart.getXAxisPane().getAxisComponent()
    const yAxis = pane.getAxisComponent()
    const chartStore = chart.getChartStore()
    const indicators = chartStore.getIndicatorsByPaneId(pane.getId())
    const defaultStyles = chartStore.getStyles().indicator

    // Accumulate GPU-eligible (solid, non-smooth) line segments from ALL indicators
    // so they can be flushed in a single instanced draw call after the Canvas2D pass.
    // NOTE: indicators with zLevel < 0 use 'destination-over' blending which cannot
    // be replicated on a separate WebGL canvas — those fall back to Canvas2D.
    const gpuLineSegs: LineSegmentData[] = []
    // Accumulate GPU-eligible (solid fill, no border/radius) rect instances.
    const gpuRects: RectInstanceData[] = []
    // Accumulate plugin-driven WebGL draws that bypass the built-in figure pipeline.
    const pluginGpuDraws: Array<{
      indicatorId: string
      indicator: {
        draw: ((args: {
          ctx: CanvasRenderingContext2D
          chart: typeof chart
          indicator: unknown
          bounding: typeof bounding
          xAxis: typeof xAxis
          yAxis: typeof yAxis
        }) => boolean) | null
      }
      output: unknown[]
      runtimeData: IndicatorPluginRuntimeData | null
      renderGL: (
        gl: WebGL2RenderingContext,
        output: unknown[],
        viewport: {
          priceMin: number
          priceMax: number
          timeMin: number
          timeMax: number
          resolution: [number, number]
        },
        vbo: WebGLBuffer
      ) => void
    }> = []

    let pluginRenderer: ReturnType<typeof getOrCreateIndicatorPluginRenderer> | undefined

    ctx.save()
    indicators.forEach(indicator => {
      if (indicator.visible) {
        if (indicator.zLevel < 0) {
          ctx.globalCompositeOperation = 'destination-over'
        } else {
          ctx.globalCompositeOperation = 'source-over'
        }
        let isCover = false

        const pluginRuntimeData = getPluginRuntimeData(indicator)
        const pluginRenderGL = pluginRuntimeData?.renderGL
        if (
          indicator.zLevel >= 0 &&
          isFunction(pluginRenderGL)
        ) {
          if (pluginRenderer === undefined) {
            pluginRenderer = getOrCreateIndicatorPluginRenderer(widget, widget.getContainer())
          }
          if (pluginRenderer !== null) {
            pluginGpuDraws.push({
              indicatorId: indicator.id,
              indicator,
              output: Array.isArray(pluginRuntimeData.output) ? pluginRuntimeData.output : [],
              runtimeData: pluginRuntimeData,
              renderGL: pluginRenderGL
            })
            isCover = true
          }
        }

        if (!isCover && indicator.draw !== null) {
          ctx.save()
          isCover = indicator.draw({
            ctx,
            chart,
            indicator,
            bounding,
            xAxis,
            yAxis
          })
          ctx.restore()
        }
        if (!isCover) {
          const result = indicator.result
          const lines: Array<Array<{ coordinates: Coordinate[], styles: Partial<SmoothLineStyle> }>> = []

          this.eachChildren((data, barSpace) => {
            const { halfGapBar } = barSpace
            const { dataIndex, x } = data
            const prevX = xAxis.convertToPixel(dataIndex - 1)
            const nextX = xAxis.convertToPixel(dataIndex + 1)
            const prevData = result[dataIndex - 1] ?? null
            const currentData = result[dataIndex] ?? null
            const nextData = result[dataIndex + 1] ?? null
            const prevCoordinate = { x: prevX }
            const currentCoordinate = { x }
            const nextCoordinate = { x: nextX }
            indicator.figures.forEach(({ key }) => {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- ignore
              const prevValue = prevData?.[key]
              if (isNumber(prevValue)) {
                prevCoordinate[key] = yAxis.convertToPixel(prevValue)
              }
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- ignore
              const currentValue = currentData?.[key]
              if (isNumber(currentValue)) {
                currentCoordinate[key] = yAxis.convertToPixel(currentValue)
              }
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- ignore
              const nextValue = nextData?.[key]
              if (isNumber(nextValue)) {
                nextCoordinate[key] = yAxis.convertToPixel(nextValue)
              }
            })
            eachFigures(indicator, dataIndex, defaultStyles, (figure: IndicatorFigure, figureStyles: IndicatorFigureStyle, figureIndex: number) => {
              if (isValid(currentData?.[figure.key])) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- ignore
                const valueY = currentCoordinate[figure.key]
                let attrs = figure.attrs?.({
                  data: { prev: prevData, current: currentData, next: nextData },
                  coordinate: { prev: prevCoordinate, current: currentCoordinate, next: nextCoordinate },
                  bounding,
                  barSpace,
                  xAxis,
                  yAxis
                })
                if (!isValid<IndicatorFigureAttrs>(attrs)) {
                  switch (figure.type) {
                    case 'circle': {
                      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- ignore
                      attrs = { x, y: valueY, r: Math.max(1, halfGapBar) }
                      break
                    }
                    case 'rect':
                    case 'bar': {
                      const baseValue = figure.baseValue ?? yAxis.getRange().from
                      const baseValueY = yAxis.convertToPixel(baseValue)
                      let height = Math.abs(baseValueY - (valueY as number))
                      if (baseValue !== currentData?.[figure.key]) {
                        height = Math.max(1, height)
                      }
                      let y = 0
                      if (valueY > baseValueY) {
                        y = baseValueY
                      } else {
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- ignore
                        y = valueY
                      }
                      attrs = {
                        x: x - halfGapBar,
                        y,
                        width: Math.max(1, halfGapBar * 2),
                        height
                      }
                      break
                    }
                    case 'line': {
                      if (!isValid(lines[figureIndex])) {
                        lines[figureIndex] = []
                      }
                      if ((figureStyles as SmoothLineStyle).show !== false && isNumber(currentCoordinate[figure.key]) && isNumber(nextCoordinate[figure.key])) {
                        lines[figureIndex].push({
                          coordinates: [
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- ignore
                            { x: currentCoordinate.x, y: currentCoordinate[figure.key] },
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- ignore
                            { x: nextCoordinate.x, y: nextCoordinate[figure.key] }
                          ],
                          styles: figureStyles as unknown as SmoothLineStyle
                        })
                      }
                      break
                    }
                    default: { break }
                  }
                }
                const type = figure.type!
                if (isValid<IndicatorFigureAttrs>(attrs) && type !== 'line') {
                  if (
                    indicator.zLevel >= 0 &&
                    (type === 'rect' || type === 'bar') &&
                    isGpuRectEligible(figureStyles)
                  ) {
                    // GPU path: batch solid fill rects for a single instanced draw call
                    gpuRects.push({
                      x:      (attrs as { x: number }).x,
                      y:      (attrs as { y: number }).y,
                      width:  (attrs as { width: number }).width,
                      height: (attrs as { height: number }).height,
                      color:  figureStyles.color as string
                    })
                  } else {
                    this.createFigure({
                      name: type === 'bar' ? 'rect' : type,
                      attrs,
                      styles: figureStyles
                    })?.draw(ctx)
                  }
                }
              }
            })
          })

          // merge line and render
          lines.forEach(items => {
            if (items.length > 1) {
              const mergeLines = [
                {
                  coordinates: [items[0].coordinates[0], items[0].coordinates[1]],
                  styles: items[0].styles
                }
              ]
              for (let i = 1; i < items.length; i++) {
                const lastMergeLine = mergeLines[mergeLines.length - 1]
                const current = items[i]
                const lastMergeLineLastCoordinate = lastMergeLine.coordinates[lastMergeLine.coordinates.length - 1]
                if (
                  lastMergeLineLastCoordinate.x === current.coordinates[0].x &&
                  lastMergeLineLastCoordinate.y === current.coordinates[0].y &&
                  lastMergeLine.styles.style === current.styles.style &&
                  lastMergeLine.styles.color === current.styles.color &&
                  lastMergeLine.styles.size === current.styles.size &&
                  lastMergeLine.styles.smooth === current.styles.smooth &&
                  lastMergeLine.styles.dashedValue?.[0] === current.styles.dashedValue?.[0] &&
                  lastMergeLine.styles.dashedValue?.[1] === current.styles.dashedValue?.[1]
                ) {
                  lastMergeLine.coordinates.push(current.coordinates[1])
                } else {
                  mergeLines.push({
                    coordinates: [current.coordinates[0], current.coordinates[1]],
                    styles: current.styles
                  })
                }
              }
              mergeLines.forEach(({ coordinates, styles }) => {
                const lineStyle = styles as SmoothLineStyle
                // GPU path: solid, non-smooth lines from non-behind indicators
                if (
                  indicator.zLevel >= 0 &&
                  lineStyle.style !== 'dashed' &&
                  lineStyle.smooth !== true &&
                  typeof lineStyle.color === 'string'
                ) {
                  const hw = ((lineStyle.size as number) ?? 1) / 2
                  for (let i = 0; i < coordinates.length - 1; i++) {
                    gpuLineSegs.push({
                      x0: coordinates[i].x,
                      y0: coordinates[i].y,
                      x1: coordinates[i + 1].x,
                      y1: coordinates[i + 1].y,
                      halfWidth: hw,
                      color: lineStyle.color as string
                    })
                  }
                } else {
                  // Canvas2D fallback: dashed / smooth / destination-over indicators
                  this.createFigure({
                    name: 'line',
                    attrs: { coordinates },
                    styles
                  })?.draw(ctx)
                }
              })
            }
          })
        }
      }
    })
    ctx.restore()

    const activePluginRenderer = pluginRenderer === undefined
      ? getIndicatorPluginRenderer(widget)
      : pluginRenderer
    if (activePluginRenderer !== null) {
      const { width, height } = bounding
      activePluginRenderer.resize(width, height)
      // Always clear the plugin layer every frame to avoid stale WebGL content.
      activePluginRenderer.beginFrame()

      if (pluginGpuDraws.length > 0) {
        const gl = activePluginRenderer.getContext()
        const viewport = createPluginViewport(chart, yAxis, bounding)
        pluginGpuDraws.forEach(({ indicatorId, indicator, output, runtimeData, renderGL }) => {
          try {
            const vbo = activePluginRenderer.getOrCreateVbo(indicatorId)
            renderGL(gl, output, viewport, vbo)
          } catch (error) {
            if (runtimeData !== null) {
              runtimeData.renderGL = null
            }
            const errorMessage = error instanceof Error ? error.message : String(error)
            logWarn(
              'IndicatorView.drawImp',
              'indicator.renderGL',
              `plugin \`${indicatorId}\` renderGL failed (${errorMessage}). Falling back to render2D when available.`
            )

            const fallbackDraw = indicator.draw
            if (isFunction(fallbackDraw)) {
              try {
                ctx.save()
                ctx.globalCompositeOperation = 'source-over'
                fallbackDraw({
                  ctx,
                  chart,
                  indicator,
                  bounding,
                  xAxis,
                  yAxis
                })
                ctx.restore()
              } catch (fallbackError) {
                const fallbackErrorMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
                logWarn(
                  'IndicatorView.drawImp',
                  'indicator.draw',
                  `plugin \`${indicatorId}\` render2D fallback failed (${fallbackErrorMessage}).`
                )
              }
            }
          }
        })
      }
    }

    // -------------------------------------------------------------------------
    // GPU rect + line flush — shared WebGL canvas, single-clear-per-frame,
    // two-pass dirty detection: setData first, then beginFrame only if needed.
    // This ensures both renderers always draw together (rect under lines) and
    // the canvas is never cleared unless actual content has changed.
    // -------------------------------------------------------------------------
    const { width, height } = bounding
    const hasGpuIndicators = gpuRects.length > 0 || gpuLineSegs.length > 0
    const activeShared = hasGpuIndicators
      ? getOrCreateSharedIndicatorGLCanvas(widget, widget.getContainer())
      : getSharedIndicatorGLCanvas(widget)

    if (activeShared !== null) {
      // Resize shared canvas once — idempotent, increments sizeVersion if changed.
      activeShared.resize(width, height)

      // Obtain renderers — create only when there is actual GPU work to do;
      // otherwise use cached instances so clean frames can still skip the draw.
      const activeRectRenderer = gpuRects.length > 0
        ? getOrCreateRectRenderer(widget, activeShared)
        : getRectRenderer(widget)

      const activeLineRenderer = gpuLineSegs.length > 0
        ? getOrCreateLineRenderer(widget, activeShared)
        : getLineRenderer(widget)

      // Upload staged data — fingerprint check prevents bufferSubData when unchanged.
      activeRectRenderer?.setData(gpuRects)
      activeLineRenderer?.setData(gpuLineSegs)

      // Dirty detection: any stale VBO or canvas-resize triggers a full redraw.
      const anyDirty = (activeRectRenderer?.isDirty() ?? false) ||
                       (activeLineRenderer?.isDirty() ?? false)
      if (anyDirty) {
        // Clear once, then draw rects first (below lines for correct compositing).
        activeShared.beginFrame()
        activeRectRenderer?.draw()
        activeLineRenderer?.draw()
      }
    } else if (hasGpuIndicators) {
      // WebGL2 unavailable — Canvas2D fallback for rects and lines.
      ctx.save()
      for (const rect of gpuRects) {
        ctx.fillStyle = rect.color
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
      }
      for (const seg of gpuLineSegs) {
        ctx.beginPath()
        ctx.strokeStyle = seg.color
        ctx.lineWidth   = seg.halfWidth * 2
        ctx.moveTo(seg.x0, seg.y0)
        ctx.lineTo(seg.x1, seg.y1)
        ctx.stroke()
      }
      ctx.restore()
    }
  }
}
