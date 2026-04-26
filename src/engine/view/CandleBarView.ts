import type Nullable from '../common/Nullable'
import type { VisibleRangeData } from '../common/Data'
import type BarSpace from '../common/BarSpace'
import { isValid } from '../common/utils/typeChecks'
import type { EventHandler } from '../common/EventHandler'
import type { CandleType, CandleBarColor, RectStyle } from '../common/Styles'

import type { FigureCreate } from '../component/Figure'
import type { RectAttrs } from '../extension/figure/rect'

import ChildrenView from './ChildrenView'

import { PaneIdConstants } from '../pane/types'
import { getOrCreateRenderer, destroyRenderer, type BarRenderData } from '../common/CandleWebGLRenderer'
import { getOrCreateWorkerRenderer, getWorkerRenderer, destroyWorkerRenderer } from '../common/CandleWorkerRenderer'
import {
  getWebGPURenderer,
  getOrCreateWebGPURenderer
} from '../common/CandleWebGPURenderer'

export interface CandleBarOptions {
  type: Exclude<CandleType, 'area'>
  styles: CandleBarColor
}

export default class CandleBarView extends ChildrenView {
  private readonly _boundCandleBarClickEvent = (data: VisibleRangeData) => () => {
    this.getWidget().getPane().getChart().getChartStore().executeAction('onCandleBarClick', data)
    return false
  }

  // Track whether a WebGPU async-init has been started for this view's widget.
  private _webGPUInitStarted = false
  // True once WebGPU has rendered its first frame — triggers cleanup of stale Worker/GL canvases.
  private _webGPUActive = false

  // ---------------------------------------------------------------------------
  // WebGL/WebGPU render path (Phase 4.2 + 4.3 + 4.4)
  // Priority: WebGPU → Worker(OffscreenCanvas) → WebGL2 → Canvas2D
  // ---------------------------------------------------------------------------

  private _drawWithWebGL (
    candleBarOptions: CandleBarOptions
  ): boolean {
    const { type, styles } = candleBarOptions

    const widget     = this.getWidget()
    const pane       = widget.getPane()
    const chartStore = pane.getChart().getChartStore()

    // ── WebGPU path (highest priority, async init) ────────────────────────
    // On the very first call we fire off `getOrCreateWebGPURenderer` in the
    // background and fall through to the WebGL path for this frame.  On
    // subsequent frames the synchronous `getWebGPURenderer` returns the ready
    // renderer, so rendering shifts over automatically.
    let gpuRenderer = getWebGPURenderer(widget)
    if (gpuRenderer === null && !this._webGPUInitStarted) {
      this._webGPUInitStarted = true
      // Fire-and-forget: resolve on a future frame
      getOrCreateWebGPURenderer(widget, widget.getContainer()).catch(() => {
        // If WebGPU init fails, _webGPUInitStarted stays true so we don't
        // keep retrying, and getWebGPURenderer(widget) will return null.
      })
    }

    let activeRenderer: { resize(w: number, h: number): void; setData(b: BarRenderData[]): void; draw(...a: number[]): void } | null = null
    let mainWebGLRenderer: ReturnType<typeof getOrCreateRenderer> = null

    if (gpuRenderer !== null) {
      activeRenderer = gpuRenderer
      // First frame under WebGPU: destroy stale Worker/GL canvases to avoid DOM overlap.
      if (!this._webGPUActive) {
        this._webGPUActive = true
        destroyWorkerRenderer(widget)
        destroyRenderer(widget)
      }
    } else {
      // ── Worker renderer (OffscreenCanvas) ────────────────────────────────
      let renderer = getWorkerRenderer(widget)
      if (renderer === null) {
        renderer = getOrCreateWorkerRenderer(widget, widget.getContainer())
      }
      mainWebGLRenderer = renderer === null ? getOrCreateRenderer(widget, widget.getContainer()) : null
      if (renderer === null && mainWebGLRenderer === null) return false
      activeRenderer = (renderer ?? mainWebGLRenderer)!
    }

    // Sync canvas size with the widget bounding box
    const { width, height } = widget.getBounding()
    activeRenderer.resize(width, height)

    // Transparent body colour → hollow candle (stroke types)
    const TRANSPARENT = 'rgba(0,0,0,0)'

    // Collect per-bar instance data
    const visibleData = chartStore.getVisibleRangeDataList()
    const barSpace    = chartStore.getBarSpace()
    const barRenderData: BarRenderData[] = []

    // ── Bar color helper ──────────────────────────────────────────────────────
    const buildBar = (
      dataIndex: number,
      x: number,
      current: { open: number; high: number; low: number; close: number },
      prevClose: number | undefined
    ): BarRenderData => {
      const { open, high, low, close } = current
      const comparePrice = styles.compareRule === 'current_open' ? open : (prevClose ?? close)
      let wickColor: string, bodyColor: string, borderColor: string
      if (close > comparePrice) {
        wickColor   = styles.upWickColor
        bodyColor   = styles.upColor
        borderColor = styles.upBorderColor
      } else if (close < comparePrice) {
        wickColor   = styles.downWickColor
        bodyColor   = styles.downColor
        borderColor = styles.downBorderColor
      } else {
        wickColor   = styles.noChangeWickColor
        bodyColor   = styles.noChangeColor
        borderColor = styles.noChangeBorderColor
      }
      const isHollow =
        type === 'candle_stroke' ||
        (type === 'candle_up_stroke'   && close > open) ||
        (type === 'candle_down_stroke' && open  > close)
      if (isHollow) bodyColor = TRANSPARENT
      return { dataIndex, centerX: x, open, high, low, close, wickColor, bodyColor, borderColor }
    }

    // ── VBO overscan (Item 15) ────────────────────────────────────────────────
    // For the main-thread WebGL renderer only: pre-load OVERSCAN = 64 bars
    // before/after the visible range into the VBO so that small pans don't
    // require a full O(N) VBO re-upload.
    const OVERSCAN = 64
    let visibleOffset = 0

    if (mainWebGLRenderer !== null && visibleData.length > 0) {
      const dataList = chartStore.getDataList()
      const firstVis = visibleData[0]
      const lastVis  = visibleData[visibleData.length - 1]

      // Overscan bars BEFORE the visible range (older bars, to the left)
      const nBefore = Math.min(OVERSCAN, firstVis.dataIndex)
      for (let k = nBefore; k >= 1; k--) {
        const idx = firstVis.dataIndex - k
        const current = dataList[idx]
        if (!isValid(current)) continue
        const prev = idx > 0 ? dataList[idx - 1] : null
        const x = firstVis.x - k * barSpace.gapBar
        barRenderData.push(buildBar(idx, x, current, prev?.close))
      }
      visibleOffset = barRenderData.length  // = nBefore (or fewer if some data is invalid)
    }

    // ── Visible bars ──────────────────────────────────────────────────────────
    const visibleStart = barRenderData.length
    for (const vd of visibleData) {
      const { x, dataIndex: di, data: { current, prev } } = vd
      if (!isValid(current)) continue
      barRenderData.push(buildBar(di, x, current, prev?.close))
    }
    const visibleCount = barRenderData.length - visibleStart

    if (mainWebGLRenderer !== null && visibleData.length > 0) {
      const dataList = chartStore.getDataList()
      const lastVis  = visibleData[visibleData.length - 1]

      // Overscan bars AFTER the visible range (newer bars, to the right)
      const nAfter = Math.min(OVERSCAN, dataList.length - 1 - lastVis.dataIndex)
      for (let k = 1; k <= nAfter; k++) {
        const idx = lastVis.dataIndex + k
        const current = dataList[idx]
        if (!isValid(current)) continue
        const prev = dataList[idx - 1] ?? null
        const x = lastVis.x + k * barSpace.gapBar
        barRenderData.push(buildBar(idx, x, current, prev?.close))
      }
    }

    // Phase 4.3 — pass Y-axis range as uniforms (O(1) on pan/zoom)
    const yAxis = pane.getAxisComponent()
    const range = yAxis.getRange()

    // OHLC render mode: compute tick half-size (matches Canvas2D formula)
    let renderMode  = 0
    let ohlcHalfSize = 0
    if (type === 'ohlc') {
      renderMode = 1
      const { gapBar } = barSpace
      let ohlcSize = Math.min(Math.max(Math.round(gapBar * 0.2), 1), 8)
      if (ohlcSize > 2 && ohlcSize % 2 === 1) ohlcSize--
      ohlcHalfSize = Math.floor(ohlcSize / 2)
    }

    // For the main WebGL renderer, pass overscan metadata to enable the VBO
    // overscan fast path (skips full re-upload when panning by a few bars).
    // Other renderers receive the full array without overscan params.
    if (mainWebGLRenderer !== null) {
      mainWebGLRenderer.setData(barRenderData, visibleOffset, visibleCount)
    } else {
      activeRenderer!.setData(barRenderData)
    }
    activeRenderer!.draw(range.realFrom, range.realRange, barSpace.halfGapBar, renderMode, ohlcHalfSize)
    return true
  }

  override drawImp (ctx: CanvasRenderingContext2D): void {
    const pane = this.getWidget().getPane()
    const isMain = pane.getId() === PaneIdConstants.CANDLE
    const chartStore = pane.getChart().getChartStore()
    const candleBarOptions = this.getCandleBarOptions()
    if (candleBarOptions !== null) {
      // WebGL fast path (Phase 4.2): handles candle_solid; falls back to Canvas2D otherwise
      if (this._drawWithWebGL(candleBarOptions)) return

      const { type, styles } = candleBarOptions
      let ohlcSize = 0
      let halfOhlcSize = 0
      if (candleBarOptions.type === 'ohlc') {
        const { gapBar } = chartStore.getBarSpace()
        ohlcSize = Math.min(Math.max(Math.round(gapBar * 0.2), 1), 8)
        if (ohlcSize > 2 && ohlcSize % 2 === 1) {
          ohlcSize--
        }
        halfOhlcSize = Math.floor(ohlcSize / 2)
      }
      const yAxis = pane.getAxisComponent()
      this.eachChildren((visibleData, barSpace) => {
        const { x, data: { current, prev } } = visibleData
        if (isValid(current)) {
          const { open, high, low, close } = current
          const comparePrice = styles.compareRule === 'current_open' ? open : (prev?.close ?? close)
          const colors: string[] = []
          if (close > comparePrice) {
            colors[0] = styles.upColor
            colors[1] = styles.upBorderColor
            colors[2] = styles.upWickColor
          } else if (close < comparePrice) {
            colors[0] = styles.downColor
            colors[1] = styles.downBorderColor
            colors[2] = styles.downWickColor
          } else {
            colors[0] = styles.noChangeColor
            colors[1] = styles.noChangeBorderColor
            colors[2] = styles.noChangeWickColor
          }
          const openY = yAxis.convertToPixel(open)
          const closeY = yAxis.convertToPixel(close)
          const priceY = [
            openY, closeY,
            yAxis.convertToPixel(high),
            yAxis.convertToPixel(low)
          ]
          priceY.sort((a, b) => a - b)

          const correction = barSpace.gapBar % 2 === 0 ? 1 : 0
          let rects: Array<FigureCreate<RectAttrs | RectAttrs[], Partial<RectStyle>>> = []
          switch (type) {
            case 'candle_solid': {
              rects = this._createSolidBar(x, priceY, barSpace, colors, correction)
              break
            }
            case 'candle_stroke': {
              rects = this._createStrokeBar(x, priceY, barSpace, colors, correction)
              break
            }
            case 'candle_up_stroke': {
              if (close > open) {
                rects = this._createStrokeBar(x, priceY, barSpace, colors, correction)
              } else {
                rects = this._createSolidBar(x, priceY, barSpace, colors, correction)
              }
              break
            }
            case 'candle_down_stroke': {
              if (open > close) {
                rects = this._createStrokeBar(x, priceY, barSpace, colors, correction)
              } else {
                rects = this._createSolidBar(x, priceY, barSpace, colors, correction)
              }
              break
            }
            case 'ohlc': {
              rects = [
                {
                  name: 'rect',
                  attrs: [
                    {
                      x: x - halfOhlcSize,
                      y: priceY[0],
                      width: ohlcSize,
                      height: priceY[3] - priceY[0]
                    },
                    {
                      x: x - barSpace.halfGapBar,
                      y: openY + ohlcSize > priceY[3] ? priceY[3] - ohlcSize : openY,
                      width: barSpace.halfGapBar - halfOhlcSize,
                      height: ohlcSize
                    },
                    {
                      x: x + halfOhlcSize,
                      y: closeY + ohlcSize > priceY[3] ? priceY[3] - ohlcSize : closeY,
                      width: barSpace.halfGapBar - halfOhlcSize,
                      height: ohlcSize
                    }
                  ],
                  styles: { color: colors[0] }
                }
              ]
              break
            }
          }
          rects.forEach(rect => {
            let handler: Nullable<EventHandler> = null
            if (isMain) {
              handler = {
                mouseClickEvent: this._boundCandleBarClickEvent(visibleData)
              }
            }
            this.createFigure(rect, handler ?? undefined)?.draw(ctx)
          })
        }
      })
    }
  }

  protected getCandleBarOptions (): Nullable<CandleBarOptions> {
    const candleStyles = this.getWidget().getPane().getChart().getStyles().candle
    return {
      type: candleStyles.type as Exclude<CandleType, 'area'>,
      styles: candleStyles.bar
    }
  }

  private _createSolidBar (x: number, priceY: number[], barSpace: BarSpace, colors: string[], correction: number): Array<FigureCreate<RectAttrs | RectAttrs[], Partial<RectStyle>>> {
    return [
      {
        name: 'rect',
        attrs: {
          x,
          y: priceY[0],
          width: 1,
          height: priceY[3] - priceY[0]
        },
        styles: { color: colors[2] }
      },
      {
        name: 'rect',
        attrs: {
          x: x - barSpace.halfGapBar,
          y: priceY[1],
          width: barSpace.gapBar + correction,
          height: Math.max(1, priceY[2] - priceY[1])
        },
        styles: {
          style: 'stroke_fill',
          color: colors[0],
          borderColor: colors[1]
        }
      }
    ]
  }

  private _createStrokeBar (x: number, priceY: number[], barSpace: BarSpace, colors: string[], correction: number): Array<FigureCreate<RectAttrs | RectAttrs[], Partial<RectStyle>>> {
    return [
      {
        name: 'rect',
        attrs: [
          {
            x,
            y: priceY[0],
            width: 1,
            height: priceY[1] - priceY[0]
          },
          {
            x,
            y: priceY[2],
            width: 1,
            height: priceY[3] - priceY[2]
          }
        ],
        styles: { color: colors[2] }
      },
      {
        name: 'rect',
        attrs: {
          x: x - barSpace.halfGapBar,
          y: priceY[1],
          width: barSpace.gapBar + correction,
          height: Math.max(1, priceY[2] - priceY[1])
        },
        styles: {
          style: 'stroke',
          borderColor: colors[1]
        }
      }
    ]
  }
}
