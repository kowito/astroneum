import type { ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Drawing tool icons: 28 × 28, 1 px outline strokes in currentColor, hollow
// round handles where a drawing has anchor points. Lines are trimmed at the
// handle edge instead of running through it, so each handle reads as a ring.
// Coordinates sit on half pixels where a stroke must be crisp at 1×.
// ---------------------------------------------------------------------------

type Pt = readonly [number, number]

/** Radius of a hollow anchor handle. */
const R = 2

const n = (v: number): number => Math.round(v * 100) / 100

/** A straight line from a to b, cut back by the handle radius at anchored ends. */
function seg (a: Pt, b: Pt, trimA = false, trimB = false): string {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy)
  const ux = dx / len
  const uy = dy / len
  const s = trimA ? R : 0
  const e = trimB ? R : 0
  return `M${n(a[0] + ux * s)} ${n(a[1] + uy * s)}L${n(b[0] - ux * e)} ${n(b[1] - uy * e)}`
}

/** A polyline through `points`; `anchored[i]` puts a handle on point i. */
function chain (points: Pt[], anchored: boolean[]): ReactNode {
  let d = ''
  for (let i = 0; i < points.length - 1; i++) d += seg(points[i], points[i + 1], anchored[i], anchored[i + 1])
  return (
    <>
      <path d={d}/>
      {points.map((p, i) => anchored[i] ? <circle key={i} cx={p[0]} cy={p[1]} r={R}/> : null)}
    </>
  )
}

/** A polyline with small solid dots on its vertices (wave counts). */
function dotted (points: Pt[]): ReactNode {
  return (
    <>
      <path d={points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]} ${p[1]}`).join('')} strokeLinejoin="round"/>
      {points.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={1.5} fill="currentColor" stroke="none"/>)}
    </>
  )
}

const Anchor = ({ p }: { p: Pt }) => <circle cx={p[0]} cy={p[1]} r={R}/>

function svg (children: ReactNode, className?: string) {
  return (
    <svg
      className={`icon-overlay ${className ?? ''}`}
      viewBox="0 0 28 28"
      width="28"
      height="28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      aria-hidden="true">
      {children}
    </svg>
  )
}

const ALL = (count: number): boolean[] => new Array<boolean>(count).fill(true)

// ── Lines ──────────────────────────────────────────────────────────────────

export const horizontalStraightLine = (c?: string) => svg(chain([[4, 14.5], [14.5, 14.5], [24, 14.5]], [false, true, false]), c)
export const horizontalRayLine = (c?: string) => svg(chain([[7.5, 14.5], [24, 14.5]], [true, false]), c)
export const horizontalSegment = (c?: string) => svg(chain([[6.5, 14.5], [21.5, 14.5]], ALL(2)), c)
export const verticalStraightLine = (c?: string) => svg(chain([[14.5, 4], [14.5, 14.5], [14.5, 24]], [false, true, false]), c)
export const verticalRayLine = (c?: string) => svg(chain([[14.5, 20.5], [14.5, 4]], [true, false]), c)
export const verticalSegment = (c?: string) => svg(chain([[14.5, 6.5], [14.5, 21.5]], ALL(2)), c)
export const straightLine = (c?: string) => svg(chain([[4, 24], [10.5, 17.5], [17.5, 10.5], [24, 4]], [false, true, true, false]), c)
export const rayLine = (c?: string) => svg(chain([[7.5, 20.5], [14.5, 13.5], [24, 4]], [true, true, false]), c)
export const segment = (c?: string) => svg(chain([[7.5, 20.5], [20.5, 7.5]], ALL(2)), c)

export const arrow = (c?: string) => svg(
  <>
    {chain([[6.5, 21.5], [21, 7]], [true, false])}
    <path d="M21.5 6.5L15 7.5M21.5 6.5L20.5 13" strokeLinecap="round"/>
  </>, c)

export const priceLine = (c?: string) => svg(
  <>
    {chain([[6.5, 18.5], [24, 18.5]], [true, false])}
    <rect x="13.5" y="8.5" width="10" height="6" rx="1"/>
  </>, c)

export const priceChannelLine = (c?: string) => svg(
  <>
    {chain([[4.5, 15.5], [15.5, 4.5]], ALL(2))}
    {chain([[12.5, 23.5], [23.5, 12.5]], [true, false])}
    <path d="M8.5 19.5L19.5 8.5" strokeDasharray="2 2"/>
  </>, c)

export const parallelStraightLine = (c?: string) => svg(
  <>
    {chain([[4, 16], [8.5, 11.5], [16.5, 3.5]], [false, true, false])}
    {chain([[11.5, 24.5], [19.5, 16.5], [24, 12]], [false, true, false])}
  </>, c)

// ── Fibonacci and Gann ─────────────────────────────────────────────────────

const FIB_LEVELS = [6.5, 11.5, 16.5, 21.5]

export const fibonacciLine = (c?: string) => svg(
  <>
    <path d={FIB_LEVELS.map(y => (y === 6.5
      ? seg([4, y], [20.5, y], false, true) + seg([20.5, y], [24, y], true)
      : y === 21.5
        ? seg([4, y], [7.5, y], false, true) + seg([7.5, y], [24, y], true)
        : `M4 ${y}H24`)).join('')}/>
    <path d={seg([7.5, 21.5], [20.5, 6.5], true, true)} strokeDasharray="2 2"/>
    <Anchor p={[20.5, 6.5]}/>
    <Anchor p={[7.5, 21.5]}/>
  </>, c)

export const fibonacciSegment = (c?: string) => svg(
  <>
    {chain([[6.5, 6.5], [21.5, 6.5]], [false, true])}
    <path d="M6.5 11.5H21.5M6.5 16.5H21.5"/>
    {chain([[6.5, 21.5], [21.5, 21.5]], [true, false])}
  </>, c)

export const fibonacciCircle = (c?: string) => svg(
  <>
    <circle cx="13.5" cy="14.5" r="5"/>
    <circle cx="13.5" cy="14.5" r="9"/>
    {chain([[13.5, 14.5], [20.5, 7.5]], ALL(2))}
  </>, c)

/** A golden spiral, sampled, that winds out from (15, 13). */
function spiralPath (): string {
  const b = Math.log((1 + Math.sqrt(5)) / 2) / (Math.PI / 2)
  const thetaMax = Math.PI * 3.2
  const r0 = 9.5 / Math.exp(b * thetaMax)
  let d = ''
  for (let theta = Math.PI * 0.4, i = 0; theta <= thetaMax + 1e-9; theta += 0.12, i++) {
    const r = r0 * Math.exp(b * theta)
    const x = 15 + r * Math.cos(theta)
    const y = 13 - r * Math.sin(theta)
    d += `${i === 0 ? 'M' : 'L'}${n(x)} ${n(y)}`
  }
  return d
}
const SPIRAL = spiralPath()

export const fibonacciSpiral = (c?: string) => svg(
  <>
    <path d={SPIRAL} strokeLinejoin="round"/>
    {chain([[15, 13], [22.5, 5.5]], ALL(2))}
  </>, c)

export const fibonacciSpeedResistanceFan = (c?: string) => svg(
  <>
    <path d={([[23.5, 4.5], [23.5, 10.5], [23.5, 15.5], [12.5, 4.5], [17.5, 4.5]] as Pt[]).map(p => seg([5.5, 22.5], p, true)).join('')}/>
    <path d="M5.5 4.5H23.5V22.5" strokeDasharray="2 2"/>
    <Anchor p={[5.5, 22.5]}/>
  </>, c)

export const fibonacciExtension = (c?: string) => svg(
  <>
    {chain([[4.5, 22.5], [9.5, 11.5], [14.5, 17.5]], ALL(3))}
    <path d="M17.5 5.5H24M17.5 11.5H24M17.5 17.5H24M17.5 22.5H24"/>
  </>, c)

export const gannBox = (c?: string) => svg(
  <>
    <path d={[
      seg([5.5, 22.5], [5.5, 5.5], true), seg([5.5, 5.5], [22.5, 5.5], false, true),
      seg([22.5, 5.5], [22.5, 22.5], true), seg([22.5, 22.5], [5.5, 22.5], false, true)
    ].join('')}/>
    <path d="M11.5 5.5V22.5M16.5 5.5V22.5M5.5 11.5H22.5M5.5 16.5H22.5" strokeOpacity=".6"/>
    <Anchor p={[5.5, 22.5]}/>
    <Anchor p={[22.5, 5.5]}/>
  </>, c)

export const gannFan = (c?: string) => svg(
  <>
    <path d={([[23.5, 4.5], [23.5, 13.5], [23.5, 18.5], [14.5, 4.5], [9.5, 4.5]] as Pt[]).map(p => seg([5.5, 22.5], p, true)).join('')}/>
    <Anchor p={[5.5, 22.5]}/>
  </>, c)

export const pitchfork = (c?: string) => svg(
  <>
    {chain([[6.5, 21.5], [12.5, 15.5], [23.5, 4.5]], [true, false, false])}
    {chain([[8.5, 11.5], [16.5, 19.5]], ALL(2))}
    <path d={seg([8.5, 11.5], [15.5, 4.5], true) + seg([16.5, 19.5], [23.5, 12.5], true)}/>
  </>, c)

// ── Shapes ─────────────────────────────────────────────────────────────────

export const circle = (c?: string) => svg(
  <>
    <circle cx="14" cy="14" r="9"/>
    <Anchor p={[14, 14]}/>
  </>, c)

export const rect = (c?: string) => svg(chain([[5.5, 19.5], [5.5, 8.5], [22.5, 8.5], [22.5, 19.5], [5.5, 19.5]], [true, false, true, false, true]), c)

export const parallelogram = (c?: string) => svg(chain([[4.5, 19.5], [9.5, 8.5], [23.5, 8.5], [18.5, 19.5], [4.5, 19.5]], [true, true, true, false, true]), c)

export const triangle = (c?: string) => svg(chain([[14, 5.5], [23.5, 21.5], [4.5, 21.5], [14, 5.5]], ALL(4)), c)

// ── Patterns and waves ─────────────────────────────────────────────────────

export const abcd = (c?: string) => svg(chain([[4.5, 18.5], [10.5, 8.5], [16.5, 15.5], [23.5, 5.5]], ALL(4)), c)

export const xabcd = (c?: string) => svg(
  <>
    {chain([[4.5, 20.5], [9.5, 7.5], [14.5, 15.5], [18.5, 10.5], [23.5, 21.5]], ALL(5))}
    <path d={seg([4.5, 20.5], [14.5, 15.5], true, true)} strokeDasharray="2 2"/>
  </>, c)

export const threeWaves = (c?: string) => svg(dotted([[4.5, 21.5], [10.5, 10.5], [15.5, 16.5], [23.5, 6.5]]), c)
export const fiveWaves = (c?: string) => svg(dotted([[3.5, 22.5], [7.5, 14.5], [10.5, 18.5], [16.5, 7.5], [19.5, 12.5], [24.5, 4.5]]), c)
export const eightWaves = (c?: string) => svg(dotted([[3.5, 21.5], [6.5, 14.5], [8.5, 17.5], [12.5, 8.5], [14.5, 12.5], [17.5, 5.5], [20.5, 14.5], [22.5, 10.5], [24.5, 19.5]]), c)
export const anyWaves = (c?: string) => svg(
  <path d="M3.5 18.5C6 13 7.5 12 9 15s2.5 4.5 4.5 0 3-9 5-7 1.5 9 3.5 8 2-4 2.5-5" strokeLinecap="round"/>, c)

// ── Drawing modes and controls ─────────────────────────────────────────────

const MAGNET = 'M8.5 5.5H12.5V14A1.5 1.5 0 0 0 15.5 14V5.5H19.5V14A5.5 5.5 0 0 1 8.5 14Z'
const MAGNET_POLES = 'M8.5 9.5H12.5M15.5 9.5H19.5'

export const weakMagnet = (c?: string) => svg(
  <>
    <path d={MAGNET} strokeLinejoin="round"/>
    <path d={MAGNET_POLES}/>
  </>, c)

export const strongMagnet = (c?: string) => svg(
  <>
    <path d={MAGNET} strokeLinejoin="round"/>
    <path d="M8.5 5.5H12.5V9.5H8.5ZM15.5 5.5H19.5V9.5H15.5Z" fill="currentColor"/>
    <path d="M21.5 20.5l2 1M20.5 23l1.5 1.5M23 18l2 0" strokeLinecap="round"/>
  </>, c)

export const noMagnet = (c?: string) => svg(
  <>
    <path d={MAGNET} strokeLinejoin="round"/>
    <path d={MAGNET_POLES}/>
    <path d="M5.5 22.5L22.5 5.5" strokeLinecap="round"/>
  </>, c)

export const snapLevels = (c?: string) => svg(
  <>
    <path d="M4 8.5H24M4 20.5H24" strokeDasharray="2 2"/>
    {chain([[4, 14.5], [14, 14.5], [24, 14.5]], [false, true, false])}
  </>, c)

export const lock = (c?: string) => svg(
  <>
    <rect x="8.5" y="13.5" width="11" height="9" rx="1.5"/>
    <path d="M10.5 13.5V10.5A3.5 3.5 0 0 1 17.5 10.5V13.5M14 17V19" strokeLinecap="round"/>
  </>, c)

export const unlock = (c?: string) => svg(
  <>
    <rect x="8.5" y="13.5" width="11" height="9" rx="1.5"/>
    <path d="M10.5 13.5V10.5A3.5 3.5 0 0 1 17.3 9.3M14 17V19" strokeLinecap="round"/>
  </>, c)

const EYE = 'M4.5 14C6.5 10.2 10 7.5 14 7.5S21.5 10.2 23.5 14C21.5 17.8 18 20.5 14 20.5S6.5 17.8 4.5 14Z'

export const visible = (c?: string) => svg(
  <>
    <path d={EYE}/>
    <circle cx="14" cy="14" r="3"/>
  </>, c)

export const invisible = (c?: string) => svg(
  <>
    <path d={EYE}/>
    <circle cx="14" cy="14" r="3"/>
    <path d="M6.5 21.5L21.5 6.5" strokeLinecap="round"/>
  </>, c)

export const remove = (c?: string) => svg(
  <path d="M6.5 8.5H21.5M11.5 8.5V6.5H16.5V8.5M8.5 8.5L9.5 22.5H18.5L19.5 8.5M12.5 11.5V19.5M15.5 11.5V19.5" strokeLinejoin="round"/>, c)
