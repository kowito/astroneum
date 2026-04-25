import { isValid } from '../../common/utils/typeChecks'
import type { OverlayTemplate } from '../../component/Overlay'

const horizontalRayLine: OverlayTemplate = {
  name: 'horizontalRayLine',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding }) => {
    const coordinate = { x: 0, y: coordinates[0].y }
    if (isValid(coordinates[1]) && coordinates[0].x < coordinates[1].x) {
      coordinate.x = bounding.width
    }
    return [
      {
        type: 'line',
        attrs: { coordinates: [coordinates[0], coordinate] }
      }
    ]
  },
  performEventPressedMove: ({ points, performPoint }) => {
    points[0].value = performPoint.value
    points[1].value = performPoint.value
  },
  performEventMoveForDrawing: ({ currentStep, points, performPoint }) => {
    if (currentStep === 2) {
      points[0].value = performPoint.value
    }
  }
}

export default horizontalRayLine
