import type { OverlayTemplate } from '@/types'

import { fibonacciLines } from './utils'

const fibonacciExtension: OverlayTemplate = {
  name: 'fibonacciExtension',
  totalStep: 4,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay, chart }) => {
    if (coordinates.length <= 2) return [{ type: 'line', attrs: { coordinates }, styles: { style: 'dashed' } }, { type: 'line', attrs: [] }, { type: 'text', ignoreEvent: true, attrs: [] }]
    const points = overlay.points
    // @ts-expect-error points[n].value is not typed on the overlay type
    const valueDif = points[1].value - points[0].value
    const yDif = coordinates[1].y - coordinates[0].y
    const pricePrecision = chart.getSymbol()?.pricePrecision ?? 2
    // @ts-expect-error fibonacciLines returns untyped lines/texts from engine
    const { lines, texts } = fibonacciLines([0, 0.236, 0.382, 0.5, 0.618, 0.786, 1], coordinates[1], coordinates[2], yDif, valueDif, points[2].value, pricePrecision)
    return [
      { type: 'line', attrs: { coordinates }, styles: { style: 'dashed' } },
      { type: 'line', attrs: lines },
      { type: 'text', ignoreEvent: true, attrs: texts }
    ]
  }
}

export default fibonacciExtension
