import { isValid } from '../common/utils/typeChecks'
import type YAxis from '../component/YAxis'

import View from './View'

export default class CandleLastPriceView extends View {
  override drawImp (ctx: CanvasRenderingContext2D): void {
    const widget = this.getWidget()
    const pane = widget.getPane()
    const bounding = widget.getBounding()
    const chartStore = pane.getChart().getChartStore()
    const priceMarkStyles = chartStore.getStyles().candle.priceMark
    const lastPriceMarkStyles = priceMarkStyles.last
    const lastPriceMarkLineStyles = lastPriceMarkStyles.line
    if (priceMarkStyles.show && lastPriceMarkStyles.show && lastPriceMarkLineStyles.show) {
      const yAxis = pane.getAxisComponent() as YAxis
      const dataList = chartStore.getDataList()
      const data = dataList[dataList.length - 1]
      if (isValid(data)) {
        const { close, open } = data
        const comparePrice = lastPriceMarkStyles.compareRule === 'current_open' ? open : (dataList[dataList.length - 2]?.close ?? close)
        const priceY = yAxis.convertToNicePixel(close)
        let color = ''
        if (close > comparePrice) {
          color = lastPriceMarkStyles.upColor
        } else if (close < comparePrice) {
          color = lastPriceMarkStyles.downColor
        } else {
          color = lastPriceMarkStyles.noChangeColor
        }
        this.createFigure({
          name: 'line',
          attrs: {
            coordinates: [
              { x: 0, y: priceY },
              { x: bounding.width, y: priceY }
            ]
          },
          styles: {
            style: lastPriceMarkLineStyles.style,
            color,
            size: lastPriceMarkLineStyles.size,
            dashedValue: lastPriceMarkLineStyles.dashedValue
          }
        })?.draw(ctx)
      }
    }
  }
}
