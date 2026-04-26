import { useEffect, useRef, useState } from 'react'

import type { Nullable, Chart } from '@/types'

// ---------------------------------------------------------------------------
// useClockTick
// ---------------------------------------------------------------------------

/**
 * Returns a HH:MM:SS string that updates every second.
 */
export function useClockTick (): string {
  const [clockTime, setClockTime] = useState('')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const tick = (): void => {
      const now = new Date()
      setClockTime(
        `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
      )
    }
    tick()
    intervalRef.current = setInterval(tick, 1000)
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [])

  return clockTime
}

// ---------------------------------------------------------------------------
// useKeyboardShortcuts
// ---------------------------------------------------------------------------

/**
 * Registers Delete/Backspace/Escape shortcuts for overlay management.
 * Returns a stable cleanup function — the caller must run it inside their own
 * effect cleanup so it shares the widget lifecycle.
 */
export function useKeyboardShortcuts (widgetRef: React.RefObject<Nullable<Chart>>): () => void {
  const cleanupRef = useRef<() => void>(() => {})

  useEffect(() => {
    const handleKeyDown = (keyboardEvent: KeyboardEvent): void => {
      const tag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      const widget = widgetRef.current
      if (!widget) return
      if (keyboardEvent.key === 'Delete' || keyboardEvent.key === 'Backspace') {
        widget.removeOverlay()
      } else if (keyboardEvent.key === 'Escape') {
        widget.overrideOverlay({ isDrawEnd: true } as never)
        widget.removeOverlay({ id: '' })
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    const cleanup = (): void => { document.removeEventListener('keydown', handleKeyDown) }
    cleanupRef.current = cleanup
    return cleanup
  }, [widgetRef])

  return cleanupRef.current
}
