import type { OverlayTemplate } from '@/types'

/**
 * Gann Fan
 * Two points: origin (pivot) and a reference point defining the 1x1 scale.
 * Draws fan lines at angles: 1x8, 1x4, 1x3, 1x2, 1x1, 2x1, 3x1, 4x1, 8x1
 * The "1x1" angle is determined by the vector from origin to reference point.
 */

// Fan ratios — each ratio is (priceUnits / timeUnits) relative to the 1x1 baseline
const FAN_RATIOS = [
  { label: '1x8', ratio: 8 },
  { label: '1x4', ratio: 4 },
  { label: '1x3', ratio: 3 },
  { label: '1x2', ratio: 2 },
  { label: '1x1', ratio: 1 },
  { label: '2x1', ratio: 0.5 },
  { label: '3x1', ratio: 1 / 3 },
  { label: '4x1', ratio: 0.25 },
  { label: '8x1', ratio: 0.125 }
]

const gannFan: OverlayTemplate = {
  name: 'gannFan',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding }) => {
    if (coordinates.length < 2) return []

    const [origin, ref] = coordinates

    const dx = ref.x - origin.x
    const dy = ref.y - origin.y

    if (Math.abs(dx) < 1e-6) return []

    // The 1x1 slope in pixel space
    const baseSlope = dy / dx

    const lines: { coordinates: { x: number; y: number }[] }[] = []
    const texts: { x: number; y: number; text: string; baseline?: string }[] = []

    for (const { label, ratio } of FAN_RATIOS) {
      const slope = baseSlope * ratio

      // Determine the far end of the ray based on bounding box
      const far = getFanRayEnd(origin, slope, dx > 0, bounding)
      lines.push({ coordinates: [origin, far] })

      // Place label near the far end, offset slightly
      texts.push({
        x: far.x,
        y: far.y,
        text: label,
        baseline: 'bottom'
      })
    }

    return [
      { type: 'line', attrs: lines },
      { type: 'text', ignoreEvent: true, attrs: texts }
    ]
  }
}

/**
 * Given an origin, a slope, and a direction (left or right), compute the point
 * where the ray exits the bounding box.
 */
function getFanRayEnd (
  origin: { x: number; y: number },
  slope: number,
  goRight: boolean,
  bounding: { width: number; height: number }
): { x: number; y: number } {
  // Candidate intersections with bounding box edges
  const candidates: { x: number; y: number }[] = []

  const xEdge = goRight ? bounding.width : 0
  const yAtXEdge = origin.y + slope * (xEdge - origin.x)
  if (yAtXEdge >= 0 && yAtXEdge <= bounding.height) {
    candidates.push({ x: xEdge, y: yAtXEdge })
  }

  // Top edge (y = 0)
  if (Math.abs(slope) > 1e-6) {
    const xAtTop = origin.x + (0 - origin.y) / slope
    if (xAtTop >= 0 && xAtTop <= bounding.width && (goRight ? xAtTop > origin.x : xAtTop < origin.x)) {
      candidates.push({ x: xAtTop, y: 0 })
    }
    // Bottom edge (y = height)
    const xAtBottom = origin.x + (bounding.height - origin.y) / slope
    if (xAtBottom >= 0 && xAtBottom <= bounding.width && (goRight ? xAtBottom > origin.x : xAtBottom < origin.x)) {
      candidates.push({ x: xAtBottom, y: bounding.height })
    }
  }

  if (candidates.length === 0) return { x: xEdge, y: yAtXEdge }

  // Pick the candidate that is farthest from origin
  return candidates.reduce((best, c) => {
    const distBest = Math.hypot(best.x - origin.x, best.y - origin.y)
    const distC = Math.hypot(c.x - origin.x, c.y - origin.y)
    return distC > distBest ? c : best
  })
}

export default gannFan
