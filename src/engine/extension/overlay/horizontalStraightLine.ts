import type { OverlayTemplate } from '../../component/Overlay'

const horizontalStraightLine: OverlayTemplate = {
  name: 'horizontalStraightLine',
  totalStep: 2,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding }) => [{
    type: 'line',
    attrs: {
      coordinates: [
        {
          x: 0,
          y: coordinates[0].y
        }, {
          x: bounding.width,
          y: coordinates[0].y
        }
      ]
    }
  }]
}

export default horizontalStraightLine
