import type Bounding from '../common/Bounding'
import type Crosshair from '../common/Crosshair'
import type { CrosshairStyle, CrosshairDirectionStyle, StateTextStyle } from '../common/Styles'
import { isString } from '../common/utils/typeChecks'
import { createFont } from '../common/utils/canvas'
import { SymbolDefaultPrecisionConstants } from '../common/SymbolInfo'

import type { Axis } from '../component/Axis'
import type YAxis from '../component/YAxis'

import type { TextAttrs } from '../extension/figure/text'
import { getTextRect } from '../extension/figure/text'
import { drawRect } from '../extension/figure/rect'

import type ChartStore from '../Store'

import View from './View'

export default class CrosshairHorizontalLabelView<C extends Axis = YAxis> extends View<C> {
  override drawImp (ctx: CanvasRenderingContext2D): void {
    const widget = this.getWidget()
    const pane = widget.getPane()
    const chartStore = widget.getPane().getChart().getChartStore()
    const crosshair = chartStore.getCrosshair()
    if (isString(crosshair.paneId) && this.compare(crosshair, pane.getId())) {
      const styles = chartStore.getStyles().crosshair
      if (styles.show) {
        const directionStyles = this.getDirectionStyles(styles)
        const textStyles = directionStyles.text
        if (directionStyles.show && textStyles.show) {
          const bounding = widget.getBounding()
          const axis = pane.getAxisComponent()
          const text = this.getText(crosshair, chartStore, axis)
          ctx.font = createFont(textStyles.size, textStyles.weight, textStyles.family)
          const textWidth = ctx.measureText(text).width
          const attrs = this.getTextAttrs(text, textWidth, crosshair, bounding, axis, textStyles)
          const tr = widget.getTextRenderer()
          if (tr !== null) {
            // Hybrid: Canvas2D draws the background badge rect; GPU draws the glyph.
            if (textStyles.backgroundColor) {
              const rect = getTextRect(attrs, textStyles)
              drawRect(ctx, [rect], { ...textStyles, color: textStyles.backgroundColor })
            }
            tr.queue({
              text,
              x: attrs.x,
              y: attrs.y,
              fontSize: textStyles.size,
              fontFamily: textStyles.family,
              color: textStyles.color,
              align: attrs.align,
              baseline: attrs.baseline,
              paddingLeft: textStyles.paddingLeft,
              paddingTop: textStyles.paddingTop
            })
          } else {
            this.createFigure({
              name: 'text',
              attrs,
              styles: textStyles
            })?.draw(ctx)
          }
        }
      }
    }
  }

  protected compare (crosshair: Crosshair, paneId: string): boolean {
    return crosshair.paneId === paneId
  }

  protected getDirectionStyles (styles: CrosshairStyle): CrosshairDirectionStyle {
    return styles.horizontal
  }

  protected getText (crosshair: Crosshair, chartStore: ChartStore, axis: Axis): string {
    const yAxis = axis as unknown as YAxis
    const value = axis.convertFromPixel(crosshair.y!)
    let precision = 0
    let shouldFormatBigNumber = false
    if (yAxis.isInCandle()) {
      precision = chartStore.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE
    } else {
      const indicators = chartStore.getIndicatorsByPaneId(crosshair.paneId!)
      indicators.forEach(indicator => {
        precision = Math.max(indicator.precision, precision)
        shouldFormatBigNumber ||= indicator.shouldFormatBigNumber
      })
    }
    const yAxisRange = yAxis.getRange()
    let text = yAxis.displayValueToText(
      yAxis.realValueToDisplayValue(
        yAxis.valueToRealValue(value, { range: yAxisRange }),
        { range: yAxisRange }
      ),
      precision
    )

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ignore
    if (shouldFormatBigNumber) {
      text = chartStore.getInnerFormatter().formatBigNumber(text)
    }
    return chartStore.getDecimalFold().format(chartStore.getThousandsSeparator().format(text))
  }

  protected getTextAttrs (text: string, _textWidth: number, crosshair: Crosshair, bounding: Bounding, axis: Axis, _styles: StateTextStyle): TextAttrs {
    const yAxis = axis as unknown as YAxis
    let x = 0
    let textAlign: CanvasTextAlign = 'left'
    if (yAxis.isFromZero()) {
      x = 0
      textAlign = 'left'
    } else {
      x = bounding.width
      textAlign = 'right'
    }

    return { x, y: crosshair.y!, text, align: textAlign, baseline: 'middle' }
  }
}
