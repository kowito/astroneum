import type { OverlayTemplate } from '../../component/Overlay'

const verticalRayLine: OverlayTemplate = {
  name: 'verticalRayLine',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding }) => {
    if (coordinates.length === 2) {
      const coordinate = { x: coordinates[0].x, y: 0 }
      if (coordinates[0].y < coordinates[1].y) {
        coordinate.y = bounding.height
      }
      return [
        {
          type: 'line',
          attrs: { coordinates: [coordinates[0], coordinate] }
        }
      ]
    }
    return []
  },
  performEventPressedMove: ({ points, performPoint }) => {
    points[0].timestamp = performPoint.timestamp
    points[0].dataIndex = performPoint.dataIndex
    points[1].timestamp = performPoint.timestamp
    points[1].dataIndex = performPoint.dataIndex
  },
  performEventMoveForDrawing: ({ currentStep, points, performPoint }) => {
    if (currentStep === 2) {
      points[0].timestamp = performPoint.timestamp
      points[0].dataIndex = performPoint.dataIndex
    }
  }
}

export default verticalRayLine
