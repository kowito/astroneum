import type { OverlayTemplate } from '@/types'

import { getDistance, OVERLAY_FILL_COLOR } from './utils'

const circle: OverlayTemplate = {
  name: 'circle',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  styles: {
    circle: {
      color: OVERLAY_FILL_COLOR
    }
  },
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length > 1) {
      const radius = getDistance(coordinates[0], coordinates[1])
      return {
        type: 'circle',
        attrs: {
          ...coordinates[0],
          r: radius
        },
        styles: { style: 'stroke_fill' }
      }
    }
    return []
  }
}

export default circle
