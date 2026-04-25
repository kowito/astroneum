import type { OverlayTemplate } from '@/types'

import { getRotateCoordinate, getOffsetAngle } from './utils'

const arrow: OverlayTemplate = {
  name: 'arrow',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length > 1) {
      const offsetAngle = getOffsetAngle(coordinates[0], coordinates[1])
      const rotateCoordinate1 = getRotateCoordinate({ x: coordinates[1].x - 8, y: coordinates[1].y + 4 }, coordinates[1], offsetAngle)
      const rotateCoordinate2 = getRotateCoordinate({ x: coordinates[1].x - 8, y: coordinates[1].y - 4 }, coordinates[1], offsetAngle)
      return [
        {
          type: 'line',
          attrs: { coordinates }
        },
        {
          type: 'line',
          ignoreEvent: true,
          attrs: { coordinates: [rotateCoordinate1, coordinates[1], rotateCoordinate2] }
        }
      ]
    }
    return []
  }
}

export default arrow
