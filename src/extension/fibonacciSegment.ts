import type { OverlayTemplate } from '@/types'

import { fibonacciLines } from './utils'

const fibonacciSegment: OverlayTemplate = {
  name: 'fibonacciSegment',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay, chart }) => {
    if (coordinates.length <= 1) return [{ type: 'line', attrs: [] }, { type: 'text', ignoreEvent: true, attrs: [] }]
    const points = overlay.points
    // @ts-expect-error points[n].value is not typed on the overlay type
    const valueDif = points[0].value - points[1].value
    const yDif = coordinates[0].y - coordinates[1].y
    const pricePrecision = chart.getSymbol()?.pricePrecision ?? 2
    // @ts-expect-error fibonacciLines returns untyped lines/texts from engine
    const { lines, texts } = fibonacciLines([1, 0.786, 0.618, 0.5, 0.382, 0.236, 0], coordinates[0], coordinates[1], yDif, valueDif, points[1].value, pricePrecision)
    return [{ type: 'line', attrs: lines }, { type: 'text', ignoreEvent: true, attrs: texts }]
  }
}

export default fibonacciSegment
