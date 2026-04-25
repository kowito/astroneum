import { formatPrecision } from '../../common/utils/format'
import { SymbolDefaultPrecisionConstants } from '../../common/SymbolInfo'
import { isFunction, isNumber, isValid } from '../../common/utils/typeChecks'

import type { OverlayTemplate } from '../../component/Overlay'

const simpleTag: OverlayTemplate = {
  name: 'simpleTag',
  totalStep: 2,
  styles: {
    line: { style: 'dashed' }
  },
  createPointFigures: ({ bounding, coordinates }) => ({
    type: 'line',
    attrs: {
      coordinates: [
        { x: 0, y: coordinates[0].y },
        { x: bounding.width, y: coordinates[0].y }
      ]
    },
    ignoreEvent: true
  }),
  createYAxisFigures: ({ chart, overlay, coordinates, bounding, yAxis }) => {
    const isFromZero = yAxis?.isFromZero() ?? false
    let textAlign: CanvasTextAlign = 'left'
    let x = 0
    if (isFromZero) {
      textAlign = 'left'
      x = 0
    } else {
      textAlign = 'right'
      x = bounding.width
    }
    let text = ''
    if (isValid(overlay.extendData)) {
      if (!isFunction(overlay.extendData)) {
        text = (overlay.extendData ?? '') as string
      } else {
        text = overlay.extendData(overlay) as string
      }
    }
    if (!isValid(text) && isNumber(overlay.points[0].value)) {
      text = formatPrecision(overlay.points[0].value, chart.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE)
    }
    return { type: 'text', attrs: { x, y: coordinates[0].y, text, align: textAlign, baseline: 'middle' } }
  }
}

export default simpleTag
