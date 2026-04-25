import type { OverlayTemplate } from '../../component/Overlay'

const verticalStraightLine: OverlayTemplate = {
  name: 'verticalStraightLine',
  totalStep: 2,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding }) => [
    {
      type: 'line',
      attrs: {
        coordinates: [
          {
            x: coordinates[0].x,
            y: 0
          }, {
            x: coordinates[0].x,
            y: bounding.height
          }
        ]
      }
    }
  ]
}

export default verticalStraightLine
