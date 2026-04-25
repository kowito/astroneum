import type { OverlayTemplate } from '../../component/Overlay'
import { isFunction, isValid } from '../../common/utils/typeChecks'

const simpleAnnotation: OverlayTemplate = {
  name: 'simpleAnnotation',
  totalStep: 2,
  styles: {
    line: { style: 'dashed' }
  },
  createPointFigures: ({ overlay, coordinates }) => {
    let text = ''
    if (isValid(overlay.extendData)) {
      if (!isFunction(overlay.extendData)) {
        text = (overlay.extendData ?? '') as string
      } else {
        text = (overlay.extendData(overlay)) as string
      }
    }
    const startX = coordinates[0].x
    const startY = coordinates[0].y - 6
    const lineEndY = startY - 50
    const arrowEndY = lineEndY - 5
    return [
      {
        type: 'line',
        attrs: { coordinates: [{ x: startX, y: startY }, { x: startX, y: lineEndY }] },
        ignoreEvent: true
      },
      {
        type: 'polygon',
        attrs: { coordinates: [{ x: startX, y: lineEndY }, { x: startX - 4, y: arrowEndY }, { x: startX + 4, y: arrowEndY }] },
        ignoreEvent: true
      },
      {
        type: 'text',
        attrs: { x: startX, y: arrowEndY, text, align: 'center', baseline: 'bottom' },
        ignoreEvent: true
      }
    ]
  }
}

export default simpleAnnotation
