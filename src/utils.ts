import type { Price, Volume, Timestamp } from './types'
import type { CandleData } from './engine/common/Data'

// ---------------------------------------------------------------------------
// Financial primitive brand helpers
// Use ONLY at system ingress boundaries (e.g., datafeed response parsing).
// Never sprinkle throughout domain logic — the brand is a promise about origin.
// ---------------------------------------------------------------------------

/** Cast a raw number to the Price brand. Use only when the number is known to be a price. */
export function asPrice(n: number): Price { return n as Price }

/** Cast a raw number to the Volume brand. Use only when the number is known to be a volume. */
export function asVolume(n: number): Volume { return n as Volume }

/** Cast a raw number to the Timestamp brand (milliseconds). Use only at data ingress. */
export function asTimestamp(n: number): Timestamp { return n as Timestamp }

// ---------------------------------------------------------------------------
// Frame-coalescing scheduler
// Satisfies the 16ms frame budget: under burst load, only the LAST value
// is delivered to `fn`, and only once per animation frame — O(1) per tick.
// ---------------------------------------------------------------------------

/**
 * Returns a dispatcher that schedules `fn` on the next animation frame,
 * coalescing rapid calls so only the last value is delivered.
 *
 * @example
 * const dispatch = rafCoalesce((tick: CandleData) => chart.update(tick))
 * ws.onmessage = e => dispatch(parse(e.data))  // safe to call 100×/s
 */
export function rafCoalesce<T>(fn: (value: T) => void): (value: T) => void {
  let pending: { value: T } | null = null
  let rafId: number | null = null
  return (value: T): void => {
    pending = { value }
    if (rafId !== null) return
    rafId = requestAnimationFrame(() => {
      rafId = null
      if (pending !== null) {
        fn(pending.value)
        pending = null
      }
    })
  }
}

// ---------------------------------------------------------------------------
// Deep object utilities
// ---------------------------------------------------------------------------

/**
 * OHLCV-aware frame-coalescing scheduler for financial tick streams.
 *
 * Unlike `rafCoalesce` (which drops intermediate values), `rafMergeTick`
 * merges multiple ticks that arrive within a single animation frame into
 * one financially accurate OHLCV bar:
 *
 *   open   = first tick's open  (bar opening price)
 *   high   = max across all ticks (price extreme)
 *   low    = min across all ticks (price extreme)
 *   close  = last tick's close  (current price)
 *   volume = sum of all volumes (accurate volume)
 *
 * This is the correct coalescer for financial charting:
 * - Never loses high/low extremes (important for candle accuracy)
 * - Never loses volume (critical for volume indicators)
 * - Delivers one merged tick per rAF frame — O(1) render cost
 *
 * @example
 * const dispatch = rafMergeTick((merged) => chart.updateData(merged))
 * ws.onmessage = e => dispatch(parseTick(e.data))  // safe to call 500×/s
 */
export function rafMergeTick(fn: (tick: CandleData) => void): (tick: CandleData) => void {
  let pending: CandleData | null = null
  let rafId: number | null = null
  return (tick: CandleData): void => {
    if (pending === null) {
      // First tick in this frame — snapshot it directly
      pending = {
        timestamp: tick.timestamp,
        open:      tick.open,
        high:      tick.high,
        low:       tick.low,
        close:     tick.close,
        volume:    tick.volume,
        turnover:  tick.turnover
      }
    } else {
      // Subsequent tick in same frame — merge OHLCV
      const newHigh = pending.high > tick.high
        ? pending.high
        : tick.high
      const newLow = pending.low < tick.low
        ? pending.low
        : tick.low
      const newVol = (pending.volume !== undefined && tick.volume !== undefined)
        ? asVolume(pending.volume + tick.volume)
        : (tick.volume ?? pending.volume)

      pending = {
        timestamp: pending.timestamp, // keep bar open timestamp
        open:      pending.open,      // keep first open
        high:      newHigh,
        low:       newLow,
        close:     tick.close,        // use last close
        volume:    newVol,
        turnover:  tick.turnover      // use last turnover (VWAP)
      }
    }
    if (rafId !== null) return
    rafId = requestAnimationFrame(() => {
      rafId = null
      if (pending !== null) {
        fn(pending)
        pending = null
      }
    })
  }
}

export function deepSet(obj: object, path: string, value: unknown): void {
  const keys = path.split('.')
  let current: Record<string, unknown> = obj as Record<string, unknown>
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {}
    }
    current = current[key] as Record<string, unknown>
  }
  current[keys[keys.length - 1]] = value
}

export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(item => deepClone(item)) as unknown as T
  const clone = {} as Record<string, unknown>
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      clone[key] = deepClone((obj as Record<string, unknown>)[key])
    }
  }
  return clone as T
}
