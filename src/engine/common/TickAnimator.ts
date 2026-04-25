/**
 * TickAnimator — smoothly interpolates the last candlestick bar as live ticks arrive.
 *
 * Problem it solves:
 *   Raw WebSocket ticks arrive at irregular bursts (10–500 ms apart). Without
 *   animation, the last bar jumps discretely on every tick — jarring at high
 *   update rates. TickAnimator interpolates close/high/low between the previous
 *   and next confirmed values over a configurable `duration` (default 120 ms),
 *   targeting 60–120 fps via requestAnimationFrame.
 *
 * Design rules (per SKILL.md):
 *   - Zero allocations inside the rAF loop — all state is pre-allocated
 *   - Uses `performance.now()` for sub-millisecond frame timing
 *   - Single rAF handle — never stacks multiple loops
 *   - Price fields use the branded Price type (compatible with engine CandleData)
 *
 * Usage:
 *   const animator = new TickAnimator((interpolated) => chart.updateData(interpolated))
 *   ws.onmessage = e => animator.feed(parsedTick)
 *   // On symbol change / cleanup:
 *   animator.cancel()
 */
import type { CandleData } from './Data'

/** Linear interpolation — inlined to avoid a function call in the hot rAF loop. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Clamp t to [0, 1]. */
function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t
}

/** Easing: ease-out cubic for a snappy-but-smooth feel. */
function easeOut(t: number): number {
  const s = 1 - t
  return 1 - s * s * s
}

export interface TickAnimatorOptions {
  /**
   * Duration of the interpolation animation in milliseconds.
   * Lower = more responsive but less smooth.
   * Higher = smoother but introduces lag.
   * Default: 120ms (≈7 frames at 60fps, ≈12 frames at 100fps).
   */
  duration?: number
}

export class TickAnimator {
  private readonly _onFrame: (tick: CandleData) => void
  private readonly _duration: number

  // ─── Animation state — all pre-allocated, zero rAF-loop allocation ───────

  /** Snapshot of the bar at the moment the last tick arrived (animation start). */
  private _fromClose = 0
  private _fromHigh = 0
  private _fromLow = 0

  /** Target values (the actual received tick). */
  private _toClose = 0
  private _toHigh = 0
  private _toLow = 0

  /** Stable fields that don't animate. */
  private _timestamp = 0
  private _open = 0
  private _volume = 0
  private _turnover = 0

  /** Reused output object — written in-place every rAF frame. No allocation. */
  private readonly _frame: CandleData = {
    timestamp: 0, open: 0, high: 0, low: 0, close: 0, volume: 0, turnover: 0
  }

  private _startTime = 0
  private _rafId: number | null = null
  private _running = false

  constructor(onFrame: (tick: CandleData) => void, options?: TickAnimatorOptions) {
    this._onFrame = onFrame
    this._duration = options?.duration ?? 120
    this._tick = this._tick.bind(this)
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Feed a new confirmed tick.
   * Starts (or restarts) the interpolation from the last rendered state to `next`.
   * Safe to call at any rate — will coalesce intermediate ticks automatically
   * by updating the target (`_to*`) without resetting the start time.
   */
  feed(next: CandleData): void {
    // If already animating, use the current interpolated position as the new `from`
    if (this._running) {
      const t = this._elapsed()
      this._fromClose = lerp(this._fromClose, this._toClose, t)
      this._fromHigh  = lerp(this._fromHigh,  this._toHigh,  t)
      this._fromLow   = lerp(this._fromLow,   this._toLow,   t)
    } else {
      // Start from the last known state
      this._fromClose = this._toClose || (next.close as number)
      this._fromHigh  = this._toHigh  || (next.high  as number)
      this._fromLow   = this._toLow   || (next.low   as number)
    }

    // Update target — always use the latest incoming tick
    this._toClose = next.close as number
    this._toHigh  = Math.max(this._fromHigh, next.high  as number)  // high can only grow
    this._toLow   = Math.min(this._fromLow,  next.low   as number)  // low can only shrink

    // Stable fields — these don't animate, just copy
    this._timestamp = next.timestamp as number
    this._open      = next.open      as number
    this._volume    = (next.volume  ?? 0) as number
    this._turnover  = (next.turnover ?? 0) as number

    this._startTime = performance.now()
    this._running = true

    // Schedule the rAF loop (no-op if already scheduled)
    if (this._rafId === null) {
      this._rafId = requestAnimationFrame(this._tick)
    }
  }

  /**
   * Cancel the running animation (e.g., on symbol change, unmount).
   * Safe to call at any time, including when not animating.
   */
  cancel(): void {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId)
      this._rafId = null
    }
    this._running = false
    // Reset target state so next feed() starts clean
    this._fromClose = 0
    this._fromHigh = 0
    this._fromLow = 0
    this._toClose = 0
    this._toHigh = 0
    this._toLow = 0
  }

  // ─── Private rAF loop ────────────────────────────────────────────────────

  private _elapsed(): number {
    const raw = (performance.now() - this._startTime) / this._duration
    return easeOut(clamp01(raw))
  }

  private _tick(): void {
    this._rafId = null
    if (!this._running) return

    const t = this._elapsed()

    // Write interpolated values into the pre-allocated frame object
    this._frame.timestamp = this._timestamp as CandleData['timestamp']
    this._frame.open      = this._open      as CandleData['open']
    this._frame.close     = lerp(this._fromClose, this._toClose, t) as CandleData['close']
    this._frame.high      = lerp(this._fromHigh,  this._toHigh,  t) as CandleData['high']
    this._frame.low       = lerp(this._fromLow,   this._toLow,   t) as CandleData['low']
    this._frame.volume    = this._volume    as CandleData['volume']
    this._frame.turnover  = this._turnover  as CandleData['turnover']

    this._onFrame(this._frame)

    if (t < 1) {
      // Continue loop until animation completes
      this._rafId = requestAnimationFrame(this._tick)
    } else {
      // Animation done — emit exact final values
      this._frame.close    = this._toClose   as CandleData['close']
      this._frame.high     = this._toHigh    as CandleData['high']
      this._frame.low      = this._toLow     as CandleData['low']
      this._onFrame(this._frame)
      this._running = false
    }
  }
}
