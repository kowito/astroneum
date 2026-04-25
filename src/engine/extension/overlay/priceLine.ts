import { SymbolDefaultPrecisionConstants } from '../../common/SymbolInfo'
import type { OverlayTemplate } from '../../component/Overlay'

const priceLine: OverlayTemplate = {
  name: 'priceLine',
  totalStep: 2,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ chart, coordinates, bounding, overlay, yAxis }) => {
    let precision = 0
    if (yAxis?.isInCandle() ?? true) {
      precision = chart.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE
    } else {
      const indicators = chart.getIndicators({ paneId: overlay.paneId })
      indicators.forEach(indicator => {
        precision = Math.max(precision, indicator.precision)
      })
    }
    const { value = 0 } = (overlay.points)[0]
    return [
      {
        type: 'line',
        attrs: { coordinates: [coordinates[0], { x: bounding.width, y: coordinates[0].y }] }
      },
      {
        type: 'text',
        ignoreEvent: true,
        attrs: {
          x: coordinates[0].x,
          y: coordinates[0].y,
          text: chart.getDecimalFold().format(chart.getThousandsSeparator().format(value.toFixed(precision))),
          baseline: 'bottom'
        }
      }
    ]
  }
}

export default priceLine
