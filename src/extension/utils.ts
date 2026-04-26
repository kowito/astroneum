import type { Coordinate, Bounding, LineAttrs, TextAttrs } from '@/types'
import { utils } from '@/engine'

export function getRotateCoordinate (coordinate: Coordinate, targetCoordinate: Coordinate, angle: number): Coordinate {
  const x = (coordinate.x - targetCoordinate.x) * Math.cos(angle) - (coordinate.y - targetCoordinate.y) * Math.sin(angle) + targetCoordinate.x
  const y = (coordinate.x - targetCoordinate.x) * Math.sin(angle) + (coordinate.y - targetCoordinate.y) * Math.cos(angle) + targetCoordinate.y
  return { x, y }
}

export function getRayLine (coordinates: Coordinate[], bounding: Bounding): LineAttrs | LineAttrs[] {
  if (coordinates.length > 1) {
    let coordinate: Coordinate
    if (coordinates[0].x === coordinates[1].x && coordinates[0].y !== coordinates[1].y) {
      if (coordinates[0].y < coordinates[1].y) {
        coordinate = {
          x: coordinates[0].x,
          y: bounding.height
        }
      } else {
        coordinate = {
          x: coordinates[0].x,
          y: 0
        }
      }
    } else if (coordinates[0].x > coordinates[1].x) {
      coordinate = {
        x: 0,
        y: utils.getLinearYFromCoordinates(coordinates[0], coordinates[1], { x: 0, y: coordinates[0].y })
      }
    } else {
      coordinate = {
        x: bounding.width,
        y: utils.getLinearYFromCoordinates(coordinates[0], coordinates[1], { x: bounding.width, y: coordinates[0].y })
      }
    }
    return { coordinates: [coordinates[0], coordinate] }
  }
  return []
}

export const OVERLAY_FILL_COLOR = 'rgba(22, 119, 255, 0.08)'

export function getOffsetAngle (c0: Coordinate, c1: Coordinate): number {
  const flag = c1.x > c0.x ? 0 : 1
  const kb = utils.getLinearSlopeIntercept(c0, c1)
  if (kb) {
    return Math.atan(kb[0]) + Math.PI * flag
  }
  return c1.y > c0.y ? Math.PI / 2 : Math.PI / 2 * 3
}

export function getDistance (coordinate1: Coordinate, coordinate2: Coordinate): number {
  const xDis = Math.abs(coordinate1.x - coordinate2.x)
  const yDis = Math.abs(coordinate1.y - coordinate2.y)
  return Math.sqrt(xDis * xDis + yDis * yDis)
}

export function fibonacciLines (
  percents: number[],
  coordStart: Coordinate,
  coordEnd: Coordinate,
  yDif: number,
  valueDif: number,
  baseValue: number,
  pricePrecision: number,
): { lines: LineAttrs[]; texts: TextAttrs[] } {
  const textX = coordEnd.x > coordStart.x ? coordStart.x : coordEnd.x
  const lines: LineAttrs[] = []
  const texts: TextAttrs[] = []
  percents.forEach(p => {
    const y = coordEnd.y + yDif * p
    const price = (baseValue + valueDif * p).toFixed(pricePrecision)
    lines.push({ coordinates: [{ x: coordStart.x, y }, { x: coordEnd.x, y }] })
    texts.push({ x: textX, y, text: `${price} (${(p * 100).toFixed(1)}%)`, baseline: 'bottom' })
  })
  return { lines, texts }
}