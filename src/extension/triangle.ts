import type { OverlayTemplate } from '@/types'

import { OVERLAY_FILL_COLOR } from './utils'

const triangle: OverlayTemplate = {
  name: 'triangle',
  totalStep: 4,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  styles: {
    polygon: {
      color: OVERLAY_FILL_COLOR
    }
  },
  createPointFigures: ({ coordinates }) => {
    return [
      {
        type: 'polygon',
        attrs: { coordinates },
        styles: { style: 'stroke_fill' }
      }
    ]
  }
}

export default triangle
