import type { ReactNode } from 'react'

// Top toolbar icons: 28 × 28 outline strokes in currentColor, matching the
// drawing tool icons.

const n = (v: number): number => Math.round(v * 100) / 100

function svg (children: ReactNode, size = 28) {
  return (
    <svg
      viewBox="0 0 28 28"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true">
      {children}
    </svg>
  )
}

/** A gear outline: `teeth` flat-topped teeth around a ring. */
function gearPath (cx: number, cy: number, teeth: number, rOuter: number, rInner: number): string {
  const step = (Math.PI * 2) / teeth
  const half = step * 0.22
  const flank = step * 0.36
  let d = ''
  for (let i = 0; i < teeth; i++) {
    const a = i * step
    const pts: Array<[number, number]> = [
      [rInner, a - flank], [rOuter, a - half], [rOuter, a + half], [rInner, a + flank]
    ]
    for (const [r, angle] of pts) {
      d += `${d === '' ? 'M' : 'L'}${n(cx + r * Math.cos(angle))} ${n(cy + r * Math.sin(angle))}`
    }
  }
  return d + 'Z'
}
const GEAR = gearPath(14, 14, 8, 9.5, 7.2)

/** Collapse or expand the drawing toolbar; the chevron is flipped in CSS. */
export const SidebarIcon = () => svg(
  <>
    <rect x="5.5" y="6.5" width="17" height="15" rx="2"/>
    <path d="M11.5 6.5V21.5M18 11.5L15.5 14L18 16.5"/>
  </>)

export const SearchIcon = () => svg(
  <>
    <circle cx="12.5" cy="12.5" r="6"/>
    <path d="M17 17L22 22"/>
  </>, 18)

export const IndicatorsIcon = () => svg(
  <>
    <path d="M9 22.5C10.6 22.5 11.3 21.3 11.6 19.2L13.2 8.8C13.5 6.7 14.3 5.5 16 5.5"/>
    <path d="M9.5 11.5H15.5M17 14.5L22.5 21.5M22.5 14.5L17 21.5"/>
  </>)

export const AlertIcon = () => svg(
  <>
    <circle cx="14" cy="15" r="7.5"/>
    <path d="M14 11V15.5L16.5 17.5M6 9L9 6M22 9L19 6M9.5 22L8 23.5M18.5 22L20 23.5"/>
  </>)

export const TimezoneIcon = () => svg(
  <>
    <circle cx="14" cy="14" r="8.5"/>
    <ellipse cx="14" cy="14" rx="3.5" ry="8.5"/>
    <path d="M5.5 14H22.5M7.5 9.5H20.5M7.5 18.5H20.5"/>
  </>)

export const SettingsIcon = () => svg(
  <>
    <path d={GEAR}/>
    <circle cx="14" cy="14" r="3"/>
  </>)

export const ScreenshotIcon = () => svg(
  <>
    <path d="M5.5 10.5A2 2 0 0 1 7.5 8.5H10L11.5 6.5H16.5L18 8.5H20.5A2 2 0 0 1 22.5 10.5V19.5A2 2 0 0 1 20.5 21.5H7.5A2 2 0 0 1 5.5 19.5Z"/>
    <circle cx="14" cy="15" r="3.5"/>
  </>)

export const FullscreenIcon = () => svg(
  <path d="M5.5 10.5V5.5H10.5M17.5 5.5H22.5V10.5M22.5 17.5V22.5H17.5M10.5 22.5H5.5V17.5"/>)

export const ExitFullscreenIcon = () => svg(
  <path d="M10.5 5.5V10.5H5.5M22.5 10.5H17.5V5.5M17.5 22.5V17.5H22.5M5.5 17.5H10.5V22.5"/>)
