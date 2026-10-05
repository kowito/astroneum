import type { ReactNode } from 'react'

import LazyMount from './LazyMount'

/** A framed, runnable example. `height` is the chart's height; buttons above it are part of the example. */
export default function Example({ label = 'Running example', height = 360, extra = 0, children }: {
  label?: string
  height?: number
  /** Extra height for controls rendered above the chart by the example itself. */
  extra?: number
  children: ReactNode
}) {
  return (
    <div className="dc-example">
      <div className="dc-example-bar">{label}</div>
      <LazyMount height={height + extra}>{children}</LazyMount>
    </div>
  )
}
