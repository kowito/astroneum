import type { OverlayTemplate } from '../../component/Overlay'

import type { LineAttrs } from '../figure/line'

const horizontalSegment: OverlayTemplate = {
  name: 'horizontalSegment',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates }) => {
    const lines: LineAttrs[] = []
    if (coordinates.length === 2) {
      lines.push({ coordinates })
    }
    return [
      {
        type: 'line',
        attrs: lines
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

export default horizontalSegment
