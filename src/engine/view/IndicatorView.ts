// @ts-nocheck

import type Nullable from '../common/Nullable'
import type { CandleColorCompareRule, SmoothLineStyle } from '../common/Styles'
import { formatValue } from '../common/utils/format'
import { logWarn } from '../common/utils/logger'
import { isFunction, isNumber, isValid } from '../common/utils/typeChecks'
import type Coordinate from '../common/Coordinate'
import { INDICATOR_PLUGIN_RUNTIME_KEY } from '../../constants'

import { eachFigures, type IndicatorFigure, type IndicatorFigureAttrs, type IndicatorFigureStyle } from '../component/Indicator'
import { getLineRenderer, getOrCreateLineRenderer, getOrCreateSharedIndicatorGLCanvas, getSharedIndicatorGLCanvas } from '../common/IndicatorLineWebGLRenderer'
import { getIndicatorPluginRenderer, getOrCreateIndicatorPluginRenderer } from '../common/IndicatorPluginWebGLRenderer'
import { getOrCreateRectRenderer, getRectRenderer, isGpuRectEligible } from '../common/IndicatorRectWebGLRenderer'
import {
  InstanceStaging, packRect, packSegment, type Rgba,
  RECT_BYTES, RECT_FLOATS, RECT_COLOR_OFFSET, SEGMENT_BYTES, SEGMENT_FLOATS, SEGMENT_COLOR_OFFSET
} from '../common/instancePacking'
import { getOrCreateColor } from '../common/candleShaders'
import { WebGLCanvas } from '../common/WebGLCanvas'

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

/** The backdrop behind volume bars, as CSS for the GPU layer (see drawImp). */
const VOLUME_BACKDROP = 'linear-gradient(to top, rgba(46, 116, 255, 0.24) 0%, rgba(46, 116, 255, 0.08) 45%, rgba(46, 116, 255, 0) 100%)'

/** Solid, straight lines with a plain colour go to the GPU; dashed, smooth and gradient lines stay on Canvas2D. */
function isGpuLineEligible (styles: SmoothLineStyle): boolean {
  return styles.style !== 'dashed' &&
    styles.smooth !== true &&
    typeof styles.color === 'string' &&
    styles.color !== 'transparent' &&
    styles.color !== ''
}

/** Canvas2D stand-in for the GPU layer when no WebGL context could be created. */
function drawStagingWithCanvas (ctx: CanvasRenderingContext2D, rects: InstanceStaging, lines: InstanceStaging): void {
  const rgba = (u8: Uint8Array, b: number): string => `rgba(${u8[b]},${u8[b + 1]},${u8[b + 2]},${u8[b + 3] / 255})`
  ctx.save()
  for (let i = 0; i < rects.count; i++) {
    const f = i * RECT_FLOATS
    ctx.fillStyle = rgba(rects.u8, i * RECT_BYTES + RECT_COLOR_OFFSET)
    ctx.fillRect(rects.f32[f], rects.f32[f + 1], rects.f32[f + 2], rects.f32[f + 3])
  }
  for (let i = 0; i < lines.count; i++) {
    const f = i * SEGMENT_FLOATS
    ctx.strokeStyle = rgba(lines.u8, i * SEGMENT_BYTES + SEGMENT_COLOR_OFFSET)
    ctx.lineWidth = lines.f32[f + 4] * 2
    ctx.beginPath()
    ctx.moveTo(lines.f32[f], lines.f32[f + 1])
    ctx.lineTo(lines.f32[f + 2], lines.f32[f + 3])
    ctx.stroke()
  }
  ctx.restore()
}

export default class IndicatorView extends CandleBarView {
  // Per-frame GPU instance data. Packed here (no GL needed) and uploaded at the
  // end of drawImp, so a pane only gets a GL context once it has GPU work.
  private readonly _lineStaging = new InstanceStaging(SEGMENT_BYTES, 1024)
  private readonly _rectStaging = new InstanceStaging(RECT_BYTES, 512)
  private readonly _colorCache = new Map<string, Rgba>()
  private _backdropOnGl = false

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

    // A subtle backdrop behind volume bars. The bars are drawn on the GPU layer,
    // which sits under this Canvas2D layer, so once that layer exists the
    // backdrop becomes its CSS background instead of a fill that would cover them.
    const hasVolumeIndicator = indicators.some(indicator => indicator.visible && indicator.series === 'volume')
    const backdropLayer = getSharedIndicatorGLCanvas(widget)
    if (backdropLayer !== null) {
      if (hasVolumeIndicator !== this._backdropOnGl) {
        backdropLayer.canvas.style.background = hasVolumeIndicator ? VOLUME_BACKDROP : ''
        this._backdropOnGl = hasVolumeIndicator
      }
    } else if (hasVolumeIndicator) {
      const gradient = ctx.createLinearGradient(0, bounding.height, 0, 0)
      gradient.addColorStop(0, 'rgba(46, 116, 255, 0.24)')
      gradient.addColorStop(0.45, 'rgba(46, 116, 255, 0.08)')
      gradient.addColorStop(1, 'rgba(46, 116, 255, 0)')
      ctx.save()
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, bounding.width, bounding.height)
      ctx.restore()
    }

    // GPU-eligible figures from every indicator are packed into two instance
    // buffers and drawn with one instanced call each after the Canvas2D pass.
    // Indicators with zLevel < 0 use 'destination-over' blending, which a
    // separate WebGL canvas cannot replicate, so they stay on Canvas2D.
    const gpu = WebGLCanvas.isSupported()
    const lineStaging = this._lineStaging
    const rectStaging = this._rectStaging
    const colorCache = this._colorCache
    lineStaging.reset()
    rectStaging.reset()
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
                      const lineStyles = figureStyles as SmoothLineStyle
                      if (lineStyles.show !== false && isNumber(currentCoordinate[figure.key]) && isNumber(nextCoordinate[figure.key])) {
                        const x0 = currentCoordinate.x
                        const y0 = currentCoordinate[figure.key] as number
                        const x1 = nextCoordinate.x
                        const y1 = nextCoordinate[figure.key] as number
                        if (gpu && indicator.zLevel >= 0 && isGpuLineEligible(lineStyles)) {
                          // One segment per bar, straight into the instance buffer: no
                          // coordinate objects, no polyline merge, no Figure per run.
                          // Shorter than half a pixel in both directions draws nothing.
                          if (Math.abs(x1 - x0) >= 0.5 || Math.abs(y1 - y0) >= 0.5) {
                            packSegment(lineStaging, x0, y0, x1, y1, (lineStyles.size ?? 1) / 2, getOrCreateColor(lineStyles.color, colorCache))
                          }
                        } else {
                          if (!isValid(lines[figureIndex])) {
                            lines[figureIndex] = []
                          }
                          lines[figureIndex].push({
                            coordinates: [{ x: x0, y: y0 }, { x: x1, y: y1 }],
                            styles: lineStyles
                          })
                        }
                      }
                      break
                    }
                    default: { break }
                  }
                }
                const type = figure.type!
                if (isValid<IndicatorFigureAttrs>(attrs) && type !== 'line') {
                  if (
                    gpu &&
                    indicator.zLevel >= 0 &&
                    (type === 'rect' || type === 'bar') &&
                    !Array.isArray(attrs) &&
                    isGpuRectEligible(figureStyles)
                  ) {
                    const { x: rectX, y: rectY, width, height } = attrs as { x: number, y: number, width: number, height: number }
                    // Thinner than half a pixel draws nothing at any zoom.
                    if (width >= 0.5 && height >= 0.5) {
                      packRect(rectStaging, rectX, rectY, width, height, getOrCreateColor(figureStyles.color, colorCache))
                    }
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
              // Lines the GPU does not draw: dashed, smooth, gradient, zLevel < 0.
              mergeLines.forEach(({ coordinates, styles }) => {
                this.createFigure({
                  name: 'line',
                  attrs: { coordinates },
                  styles
                })?.draw(ctx)
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

    // GPU flush: one shared canvas per pane, cleared once, then grid, rects
    // and lines in that order. The renderers upload only when their packed
    // bytes changed, and nothing is drawn when nothing changed.
    const { width, height } = bounding
    const hasGpuWork = rectStaging.count > 0 || lineStaging.count > 0
    const activeShared = hasGpuWork
      ? getOrCreateSharedIndicatorGLCanvas(widget, widget.getContainer())
      : getSharedIndicatorGLCanvas(widget)

    if (activeShared !== null) {
      // Idempotent; bumps sizeVersion when the size changed so every layer redraws.
      activeShared.resize(width, height)

      const activeRectRenderer = rectStaging.count > 0
        ? getOrCreateRectRenderer(widget, activeShared)
        : getRectRenderer(widget)
      const activeLineRenderer = lineStaging.count > 0
        ? getOrCreateLineRenderer(widget, activeShared)
        : getLineRenderer(widget)

      // An empty staging after a frame with data is a change too: the layer must clear.
      activeRectRenderer?.upload(rectStaging)
      activeLineRenderer?.upload(lineStaging)

      const anyDirty = (activeRectRenderer?.isDirty() ?? false) ||
                       (activeLineRenderer?.isDirty() ?? false) ||
                       (activeLineRenderer?.isGridDirty() ?? false)
      if (anyDirty) {
        activeShared.beginFrame()
        activeLineRenderer?.drawGrid()
        activeRectRenderer?.draw()
        activeLineRenderer?.draw()
      }
    } else if (hasGpuWork) {
      // WebGL2 is supported but no context could be created (for example the
      // browser's limit on live contexts): draw this frame with Canvas2D.
      drawStagingWithCanvas(ctx, rectStaging, lineStaging)
    }
  }
}
