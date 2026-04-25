import type { OverlayTemplate } from '../../component/Overlay'

const segment: OverlayTemplate = {
  name: 'segment',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length === 2) {
      return [
        {
          type: 'line',
          attrs: { coordinates }
        }
      ]
    }
    return []
  }
}

export default segment
