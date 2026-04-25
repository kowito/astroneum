// @ts-nocheck

import { isNumber, isValid } from '../common/utils/typeChecks'

import { eachFigures, type IndicatorFigure, type IndicatorFigureStyle } from '../component/Indicator'

import View from './View'

import type { YAxis } from '../component/YAxis'

export default class IndicatorLastValueView extends View<YAxis> {
  override drawImp (ctx: CanvasRenderingContext2D): void {
    const widget = this.getWidget()
    const pane = widget.getPane()
    const bounding = widget.getBounding()
    const chartStore = pane.getChart().getChartStore()
    const defaultStyles = chartStore.getStyles().indicator
    const lastValueMarkStyles = defaultStyles.lastValueMark
    const lastValueMarkTextStyles = lastValueMarkStyles.text
    if (lastValueMarkStyles.show) {
      const yAxis = pane.getAxisComponent()
      const yAxisRange = yAxis.getRange()
      const dataList = chartStore.getDataList()
      const dataIndex = dataList.length - 1
      const indicators = chartStore.getIndicatorsByPaneId(pane.getId())
      const formatter = chartStore.getInnerFormatter()
      const decimalFold = chartStore.getDecimalFold()
      const thousandsSeparator = chartStore.getThousandsSeparator()
      indicators.forEach(indicator => {
        const result = indicator.result
        const data = result[dataIndex] ?? {}
        if (isValid(data) && indicator.visible) {
          const precision = indicator.precision
          eachFigures(indicator, dataIndex, defaultStyles, (figure: IndicatorFigure, figureStyles: Required<IndicatorFigureStyle>) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- ignore
            const value = data[figure.key]
            if (isNumber(value)) {
              const y = yAxis.convertToNicePixel(value)
              let text = yAxis.displayValueToText(
                yAxis.realValueToDisplayValue(
                  yAxis.valueToRealValue(value, { range: yAxisRange }),
                  { range: yAxisRange }
                ),
                precision
              )
              if (indicator.shouldFormatBigNumber) {
                text = formatter.formatBigNumber(text)
              }
              text = decimalFold.format(thousandsSeparator.format(text))
              let x = 0
              let textAlign: CanvasTextAlign = 'left'
              if (yAxis.isFromZero()) {
                x = 0
                textAlign = 'left'
              } else {
                x = bounding.width
                textAlign = 'right'
              }

              this.createFigure({
                name: 'text',
                attrs: {
                  x,
                  y,
                  text,
                  align: textAlign,
                  baseline: 'middle'
                },
                styles: {
                  ...lastValueMarkTextStyles,
                  backgroundColor: figureStyles.color
                }
              })?.draw(ctx)
            }
          })
        }
      })
    }
  }
}
