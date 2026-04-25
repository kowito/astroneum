import type { OverlayTemplate } from '@/types'

/**
 * Andrews Pitchfork
 * 3 points: A (handle), B (upper), C (lower)
 * Median line: A → midpoint(B,C), extended to chart edge
 * Parallel lines from B and C, parallel to the median line
 * Optional 25% / 75% midlines between median and parallels
 */
const pitchfork: OverlayTemplate = {
  name: 'pitchfork',
  totalStep: 4,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding }) => {
    if (coordinates.length < 2) return []

    const [A, B, C] = coordinates

    if (coordinates.length === 2) {
      // Only A and B placed — draw provisional segment
      return [{ type: 'line', attrs: { coordinates: [A, B] } }]
    }

    // Midpoint of B and C
    const M = { x: (B.x + C.x) / 2, y: (B.y + C.y) / 2 }

    // Direction vector of the median line (A → M)
    const dx = M.x - A.x
    const dy = M.y - A.y

    // Extend median line to fill the bounding box
    const medianExtended = extendLine(A, M, bounding)

    // Parallel lines through B and C with the same direction
    const B2 = { x: B.x + dx * 10, y: B.y + dy * 10 }
    const C2 = { x: C.x + dx * 10, y: C.y + dy * 10 }
    const parallelB = extendLine(B, B2, bounding)
    const parallelC = extendLine(C, C2, bounding)

    // 25% and 75% midlines
    const midBM_start = midpoint(B, M, 0.5)
    const midCM_start = midpoint(C, M, 0.5)
    const midBM_end = { x: midBM_start.x + dx * 10, y: midBM_start.y + dy * 10 }
    const midCM_end = { x: midCM_start.x + dx * 10, y: midCM_start.y + dy * 10 }
    const midlineUpper = extendLine(midBM_start, midBM_end, bounding)
    const midlineLower = extendLine(midCM_start, midCM_end, bounding)

    // Handle lines: A → B and A → C
    const handleLines = [
      { coordinates: [A, B] },
      { coordinates: [A, C] }
    ]

    const figures = [
      // Median line (solid)
      { type: 'line', attrs: medianExtended },
      // Parallel channel lines (solid)
      { type: 'line', attrs: parallelB },
      { type: 'line', attrs: parallelC },
      // Handle connector lines (dashed)
      { type: 'line', attrs: handleLines, styles: { style: 'dashed' } },
      // Optional midlines (dashed, thinner)
      { type: 'line', attrs: [midlineUpper, midlineLower], styles: { style: 'dashed' } }
    ]

    return figures
  }
}

/** Extend a line defined by two points to fit within a bounding box */
function extendLine (
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  bounding: { width: number; height: number }
): { coordinates: { x: number; y: number }[] } {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y

  if (Math.abs(dx) < 1e-6) {
    // Vertical line
    return { coordinates: [{ x: p1.x, y: 0 }, { x: p1.x, y: bounding.height }] }
  }

  const slope = dy / dx
  const intercept = p1.y - slope * p1.x

  const leftY = intercept
  const rightY = slope * bounding.width + intercept

  return {
    coordinates: [
      { x: 0, y: leftY },
      { x: bounding.width, y: rightY }
    ]
  }
}

/** Return a point between p1 and p2 at the given ratio (0=p1, 1=p2) */
function midpoint (
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  t: number
): { x: number; y: number } {
  return { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t }
}

export default pitchfork
