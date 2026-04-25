export default interface Coordinate {
  x: number
  y: number
}

export function getDistance (coordinate1: Coordinate, coordinate2: Coordinate): number {
  const xDif = coordinate1.x - coordinate2.x
  const yDif = coordinate1.y - coordinate2.y
  return Math.sqrt(xDif * xDif + yDif * yDif)
}
