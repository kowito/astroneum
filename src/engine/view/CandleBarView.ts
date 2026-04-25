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

export interface CandleBarOptions {
  type: Exclude<CandleType, 'area'>
  styles: CandleBarColor
}

export default class CandleBarView extends ChildrenView {
  private readonly _boundCandleBarClickEvent = (data: VisibleRangeData) => () => {
    this.getWidget().getPane().getChart().getChartStore().executeAction('onCandleBarClick', data)
    return false
  }

  // ---------------------------------------------------------------------------
  // WebGL render path (Phase 4.2 + 4.3)
  // Falls back to Canvas2D for non-solid types or when WebGL2 is unavailable.
  // ---------------------------------------------------------------------------

  private _drawWithWebGL (
    candleBarOptions: CandleBarOptions
  ): boolean {
    const { type, styles } = candleBarOptions

    const widget     = this.getWidget()
    const pane       = widget.getPane()
    const chartStore = pane.getChart().getChartStore()

    const renderer = getOrCreateRenderer(widget, widget.getContainer())
    if (renderer === null) return false

    // Sync canvas size with the widget bounding box
    const { width, height } = widget.getBounding()
    renderer.resize(width, height)

    // Transparent body colour → hollow candle (stroke types)
    const TRANSPARENT = 'rgba(0,0,0,0)'

    // Collect per-bar instance data
    const visibleData = chartStore.getVisibleRangeDataList()
    const barSpace    = chartStore.getBarSpace()
    const barRenderData: BarRenderData[] = []

    for (const vd of visibleData) {
      const { x, data: { current, prev } } = vd
      if (!isValid(current)) continue

      const { open, high, low, close } = current
      const comparePrice = styles.compareRule === 'current_open' ? open : (prev?.close ?? close)

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

      // Hollow body for stroke types:
      //   candle_stroke      → always hollow
      //   candle_up_stroke   → hollow only when close > open  (up bar)
      //   candle_down_stroke → hollow only when open  > close (down bar)
      const isHollow =
        type === 'candle_stroke' ||
        (type === 'candle_up_stroke'   && close > open) ||
        (type === 'candle_down_stroke' && open  > close)
      if (isHollow) bodyColor = TRANSPARENT

      barRenderData.push({ centerX: x, open, high, low, close, wickColor, bodyColor, borderColor })
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

    renderer.setData(barRenderData)
    renderer.draw(range.realFrom, range.realRange, barSpace.halfGapBar, renderMode, ohlcHalfSize)
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
