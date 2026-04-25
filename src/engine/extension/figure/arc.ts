import type Coordinate from '../../common/Coordinate'
import { getDistance } from '../../common/Coordinate'
import type { LineStyle } from '../../common/Styles'

import { type FigureTemplate, DEVIATION } from '../../component/Figure'

import type { CircleAttrs } from './circle'

export function checkCoordinateOnArc (coordinate: Coordinate, attrs: ArcAttrs | ArcAttrs[]): boolean {
  let arcs: ArcAttrs[] = []
  arcs = arcs.concat(attrs)
  for (const arc of arcs) {
    if (Math.abs(getDistance(coordinate, arc) - arc.r) < DEVIATION) {
      const { r, startAngle, endAngle } = arc
      const startCoordinateX = r * Math.cos(startAngle) + arc.x
      const startCoordinateY = r * Math.sin(startAngle) + arc.y
      const endCoordinateX = r * Math.cos(endAngle) + arc.x
      const endCoordinateY = r * Math.sin(endAngle) + arc.y
      if (
        coordinate.x <= Math.max(startCoordinateX, endCoordinateX) + DEVIATION &&
        coordinate.x >= Math.min(startCoordinateX, endCoordinateX) - DEVIATION &&
        coordinate.y <= Math.max(startCoordinateY, endCoordinateY) + DEVIATION &&
        coordinate.y >= Math.min(startCoordinateY, endCoordinateY) - DEVIATION
      ) {
        return true
      }
    }
  }

  return false
}

export function drawArc (ctx: CanvasRenderingContext2D, attrs: ArcAttrs | ArcAttrs[], styles: Partial<LineStyle>): void {
  let arcs: ArcAttrs[] = []
  arcs = arcs.concat(attrs)
  const { style = 'solid', size = 1, color = 'currentColor', dashedValue = [2, 2] } = styles
  ctx.lineWidth = size
  ctx.strokeStyle = color
  if (style === 'dashed') {
    ctx.setLineDash(dashedValue)
  } else {
    ctx.setLineDash([])
  }
  arcs.forEach(({ x, y, r, startAngle, endAngle }) => {
    ctx.beginPath()
    ctx.arc(x, y, r, startAngle, endAngle)
    ctx.stroke()
    ctx.closePath()
  })
}

export interface ArcAttrs extends CircleAttrs {
  startAngle: number
  endAngle: number
}

const arc: FigureTemplate<ArcAttrs | ArcAttrs[], Partial<LineStyle>> = {
  name: 'arc',
  checkEventOn: checkCoordinateOnArc,
  draw: (ctx: CanvasRenderingContext2D, attrs: ArcAttrs | ArcAttrs[], styles: Partial<LineStyle>) => {
    drawArc(ctx, attrs, styles)
  }
}

export default arc
