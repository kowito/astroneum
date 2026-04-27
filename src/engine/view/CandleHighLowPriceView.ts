import type Coordinate from '../common/Coordinate'
import type { CandleHighLowPriceMarkStyle } from '../common/Styles'
import { formatPrecision } from '../common/utils/format'
import { createFont } from '../common/utils/canvas'
import { SymbolDefaultPrecisionConstants } from '../common/SymbolInfo'

import View from './View'

import type { YAxis } from '../component/YAxis'

export default class CandleHighLowPriceView extends View<YAxis> {
  override drawImp (ctx: CanvasRenderingContext2D): void {
    const widget = this.getWidget()
    const pane = widget.getPane()
    const chartStore = pane.getChart().getChartStore()
    const priceMarkStyles = chartStore.getStyles().candle.priceMark
    const highPriceMarkStyles = priceMarkStyles.high
    const lowPriceMarkStyles = priceMarkStyles.low
    if (priceMarkStyles.show && (highPriceMarkStyles.show || lowPriceMarkStyles.show)) {
      const highestLowestPrice = chartStore.getVisibleRangeHighLowPrice()
      const precision = chartStore.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE
      const yAxis = pane.getAxisComponent()

      const { price: high, x: highX } = highestLowestPrice[0]
      const { price: low, x: lowX } = highestLowestPrice[1]
      const highY = yAxis.convertToPixel(high)
      const lowY = yAxis.convertToPixel(low)
      const decimalFold = chartStore.getDecimalFold()
      const thousandsSeparator = chartStore.getThousandsSeparator()
      if (highPriceMarkStyles.show && high !== Number.MIN_SAFE_INTEGER) {
        this._drawMark(
          ctx,
          decimalFold.format(thousandsSeparator.format(formatPrecision(high, precision))),
          { x: highX, y: highY },
          highY < lowY ? [-2, -5] : [2, 5],
          highPriceMarkStyles
        )
      }
      if (lowPriceMarkStyles.show && low !== Number.MAX_SAFE_INTEGER) {
        this._drawMark(
          ctx,
          decimalFold.format(thousandsSeparator.format(formatPrecision(low, precision))),
          { x: lowX, y: lowY },
          highY < lowY ? [2, 5] : [-2, -5],
          lowPriceMarkStyles
        )
      }
    }
  }

  private _drawMark (
    ctx: CanvasRenderingContext2D,
    text: string,
    coordinate: Coordinate,
    offsets: number[],
    styles: CandleHighLowPriceMarkStyle
  ): void {
    const startX = coordinate.x
    const startY = coordinate.y + offsets[0]
    this.createFigure({
      name: 'line',
      attrs: {
        coordinates: [
          { x: startX - 2, y: startY + offsets[0] },
          { x: startX, y: startY },
          { x: startX + 2, y: startY + offsets[0] }
        ]
      },
      styles: { color: styles.color }
    })?.draw(ctx)

    let lineEndX = 0
    let textStartX = 0
    let textAlign: CanvasTextAlign = 'left'
    const { width } = this.getWidget().getBounding()
    if (startX > width / 2) {
      lineEndX = startX - 5
      textStartX = lineEndX - styles.textOffset
      textAlign = 'right'
    } else {
      lineEndX = startX + 5
      textAlign = 'left'
      textStartX = lineEndX + styles.textOffset
    }

    const y = startY + offsets[1]
    this.createFigure({
      name: 'line',
      attrs: {
        coordinates: [
          { x: startX, y: startY },
          { x: startX, y },
          { x: lineEndX, y }
        ]
      },
      styles: { color: styles.color }
    })?.draw(ctx)

    const fontSize = Math.max(styles.textSize, 11)

    ctx.save()
    ctx.font = createFont(fontSize, '400', styles.textFamily)
    ctx.textAlign = textAlign as CanvasTextAlign
    ctx.textBaseline = 'middle'

    // Shadow pass for readability on any background
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)'
    ctx.shadowBlur = 4
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0
    ctx.fillStyle = styles.color
    ctx.fillText(text, textStartX, y)

    // Second pass — clean fill over the shadow
    ctx.shadowBlur = 0
    ctx.fillText(text, textStartX, y)

    ctx.restore()
  }
}
