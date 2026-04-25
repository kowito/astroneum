import type Coordinate from '../../common/Coordinate'
import type { PolygonStyle } from '../../common/Styles'
import { isString } from '../../common/utils/typeChecks'
import { isTransparent } from '../../common/utils/color'

import type { FigureTemplate } from '../../component/Figure'

export function checkCoordinateOnCircle (coordinate: Coordinate, attrs: CircleAttrs | CircleAttrs[]): boolean {
  let circles: CircleAttrs[] = []
  circles = circles.concat(attrs)

  for (const circle of circles) {
    const { x, y, r } = circle
    const difX = coordinate.x - x
    const difY = coordinate.y - y
    if (!(difX * difX + difY * difY > r * r)) {
      return true
    }
  }
  return false
}

export function drawCircle (ctx: CanvasRenderingContext2D, attrs: CircleAttrs | CircleAttrs[], styles: Partial<PolygonStyle>): void {
  let circles: CircleAttrs[] = []
  circles = circles.concat(attrs)

  const {
    style = 'fill',
    color = 'currentColor',
    borderSize = 1,
    borderColor = 'currentColor',
    borderStyle = 'solid',
    borderDashedValue = [2, 2]
  } = styles

  const solid = (style === 'fill' || styles.style === 'stroke_fill') && (!isString(color) || !isTransparent(color))
  if (solid) {
    ctx.fillStyle = color
    circles.forEach(({ x, y, r }) => {
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.closePath()
      ctx.fill()
    })
  }
  if ((style === 'stroke' || styles.style === 'stroke_fill') && borderSize > 0 && !isTransparent(borderColor)) {
    ctx.strokeStyle = borderColor
    ctx.lineWidth = borderSize
    if (borderStyle === 'dashed') {
      ctx.setLineDash(borderDashedValue)
    } else {
      ctx.setLineDash([])
    }
    circles.forEach(({ x, y, r }) => {
      if (!solid || r > borderSize) {
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.closePath()
        ctx.stroke()
      }
    })
  }
}

export interface CircleAttrs {
  x: number
  y: number
  r: number
}

const circle: FigureTemplate<CircleAttrs | CircleAttrs[], Partial<PolygonStyle>> = {
  name: 'circle',
  checkEventOn: checkCoordinateOnCircle,
  draw: (ctx: CanvasRenderingContext2D, attrs: CircleAttrs | CircleAttrs[], styles: Partial<PolygonStyle>) => {
    drawCircle(ctx, attrs, styles)
  }
}

export default circle
