'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

/**
 * Renders its children only once the box is near the screen. A docs page can hold
 * several live charts; this keeps the ones you have not scrolled to from running.
 */
export default function LazyMount({ children, height, className, style, eager = false }: {
  children: ReactNode
  height: number
  className?: string
  style?: CSSProperties
  eager?: boolean
}) {
  const host = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(eager)

  useEffect(() => {
    if (visible || host.current === null) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true)
        observer.disconnect()
      }
    }, { rootMargin: '400px' })
    observer.observe(host.current)
    return () => { observer.disconnect() }
  }, [visible])

  return (
    <div ref={host} className={className} style={{ height, ...style }}>
      {visible ? children : <span className="dc-live-wait">Loads when scrolled into view</span>}
    </div>
  )
}
