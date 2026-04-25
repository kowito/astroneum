import type { OverlayTemplate } from '../../component/Overlay'

import { getParallelLines } from './parallelStraightLine'

const priceChannelLine: OverlayTemplate = {
  name: 'priceChannelLine',
  totalStep: 4,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding }) => [
    {
      type: 'line',
      attrs: getParallelLines(coordinates, bounding, 1)
    }
  ]
}

export default priceChannelLine
