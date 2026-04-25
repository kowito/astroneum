import type { OverlayTemplate, CircleAttrs, TextAttrs } from '@/types'

import { getDistance } from './utils'

const fibonacciCircle: OverlayTemplate = {
  name: 'fibonacciCircle',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length > 1) {
      const radius = getDistance(coordinates[0], coordinates[1])
      const percents = [0.236, 0.382, 0.5, 0.618, 0.786, 1]
      const circles: CircleAttrs[] = []
      const texts: TextAttrs[] = []
      percents.forEach(percent => {
        const r = radius * percent
        circles.push(
          { ...coordinates[0], r }
        )
        texts.push({
          x: coordinates[0].x,
          y: coordinates[0].y + r + 6,
          text: `${(percent * 100).toFixed(1)}%`
        })
      })
      return [
        {
          type: 'circle',
          attrs: circles,
          styles: { style: 'stroke' }
        },
        {
          type: 'text',
          ignoreEvent: true,
          attrs: texts
        }
      ]
    }
    return []
  }
}

export default fibonacciCircle
