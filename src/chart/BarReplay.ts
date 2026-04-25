import type { CandleData, Nullable } from '@/types'
import type { Datafeed, SymbolInfo, Period } from '@/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BarReplayState = 'idle' | 'playing' | 'paused' | 'finished'

export interface BarReplayOptions {
  /** The datafeed to load historical bars from. */
  datafeed: Datafeed
  /** Symbol to replay. */
  symbol: SymbolInfo
  /** Period to replay. */
  period: Period
  /**
   * Timestamp (ms) to start the replay from.
   * If omitted, uses the earliest bar in the loaded history.
   */
  startTime?: number
  /**
   * Timestamp (ms) to end the replay at.
   * If omitted, replays to the latest available bar.
   */
  endTime?: number
  /**
   * Milliseconds between each bar step when playing automatically.
   * Default: 500ms
   */
  intervalMs?: number
  /**
   * Number of initial bars to pre-load before replay begins.
   * Default: 300
   */
  initialBars?: number
  /** Called whenever a new bar is emitted during replay. */
  onBar?: (bar: CandleData, index: number, total: number) => void
  /** Called when replay state changes. */
  onStateChange?: (state: BarReplayState) => void
  /** Called when replay finishes (reached endTime or last bar). */
  onFinish?: () => void
}

// ---------------------------------------------------------------------------
// BarReplay
// ---------------------------------------------------------------------------

/**
 * Historical bar replay engine for manual strategy testing.
 *
 * Usage:
 * ```ts
 * const replay = new BarReplay({
 *   datafeed,
 *   symbol: { ticker: 'AAPL' },
 *   period: { multiplier: 1, timespan: 'day', text: 'D' },
 *   onBar: (bar, idx, total) => chart.applyMoreData([bar]),
 *   onStateChange: (s) => console.log('state:', s),
 * })
 *
 * await replay.load()
 * replay.play()
 * ```
 */
export default class BarReplay {
  private _opts: Required<BarReplayOptions>
  private _bars: CandleData[] = []
  private _cursor = 0
  private _state: BarReplayState = 'idle'
  private _timer: ReturnType<typeof setInterval> | null = null

  constructor (options: BarReplayOptions) {
    this._opts = {
      startTime: 0,
      endTime: Date.now(),
      intervalMs: 500,
      initialBars: 300,
      onBar: () => {},
      onStateChange: () => {},
      onFinish: () => {},
      ...options
    }
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private _setState (state: BarReplayState): void {
    this._state = state
    this._opts.onStateChange(state)
  }

  private _emitCurrent (): void {
    const bar = this._bars[this._cursor]
    if (bar) {
      this._opts.onBar(bar, this._cursor, this._bars.length)
    }
  }

  private _advance (): void {
    if (this._cursor >= this._bars.length - 1) {
      this._stop()
      this._setState('finished')
      this._opts.onFinish()
      return
    }
    this._cursor++
    this._emitCurrent()
  }

  private _stop (): void {
    if (this._timer !== null) {
      clearInterval(this._timer)
      this._timer = null
    }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Load historical bars from the datafeed.
   * Must be called before play/step.
   */
  async load (): Promise<void> {
    this._setState('idle')
    this._bars = []
    this._cursor = 0

    const { datafeed, symbol, period, startTime, endTime, initialBars } = this._opts

    // Calculate a reasonable from/to window
    const to = endTime
    const bars = await datafeed.getHistoryData(symbol, period, startTime || 0, to)

    // Filter to requested range
    this._bars = bars
      .filter(b => b.timestamp >= (startTime || 0) && b.timestamp <= to)
      .sort((a, b) => a.timestamp - b.timestamp)

    // Pre-load initial bars by positioning cursor at `initialBars` from start
    this._cursor = Math.max(0, Math.min(initialBars - 1, this._bars.length - 1))
  }

  /**
   * Get the bars that have been "revealed" so far (up to and including cursor).
   * Use this to initialise the chart with the pre-replay context bars.
   */
  getRevealedBars (): CandleData[] {
    return this._bars.slice(0, this._cursor + 1)
  }

  /** Get all loaded bars (for reference). */
  getAllBars (): CandleData[] {
    return [...this._bars]
  }

  /** Current replay state. */
  get state (): BarReplayState {
    return this._state
  }

  /** Index of the current bar (0-based from start of loaded bars). */
  get cursor (): number {
    return this._cursor
  }

  /** Total number of loaded bars. */
  get total (): number {
    return this._bars.length
  }

  /** Current bar or null if no bars loaded. */
  get currentBar (): Nullable<CandleData> {
    return this._bars[this._cursor] ?? null
  }

  /** Progress as a value between 0 and 1. */
  get progress (): number {
    if (this._bars.length <= 1) return 0
    return this._cursor / (this._bars.length - 1)
  }

  /**
   * Start auto-playing the replay at the configured interval.
   */
  play (): void {
    if (this._state === 'finished') return
    if (this._state === 'playing') return

    this._setState('playing')
    this._timer = setInterval(() => {
      this._advance()
    }, this._opts.intervalMs)
  }

  /**
   * Pause auto-play. Use play() to resume.
   */
  pause (): void {
    if (this._state !== 'playing') return
    this._stop()
    this._setState('paused')
  }

  /**
   * Toggle between play and pause.
   */
  togglePlayPause (): void {
    if (this._state === 'playing') {
      this.pause()
    } else {
      this.play()
    }
  }

  /**
   * Advance by one bar (manual step). Pauses auto-play if running.
   */
  stepForward (): void {
    if (this._state === 'playing') this.pause()
    this._advance()
  }

  /**
   * Go back one bar. Pauses auto-play if running.
   */
  stepBack (): void {
    if (this._state === 'playing') this.pause()
    if (this._cursor > 0) {
      this._cursor--
      this._emitCurrent()
    }
  }

  /**
   * Jump to a specific bar index. Pauses auto-play.
   */
  seekTo (index: number): void {
    if (this._state === 'playing') this.pause()
    const clamped = Math.max(0, Math.min(index, this._bars.length - 1))
    this._cursor = clamped
    this._emitCurrent()
  }

  /**
   * Seek to a timestamp. Finds the nearest bar at or before the given time.
   */
  seekToTime (timestamp: number): void {
    if (this._bars.length === 0) return
    // Binary-search for the closest bar
    let lo = 0
    let hi = this._bars.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (this._bars[mid].timestamp <= timestamp) lo = mid
      else hi = mid - 1
    }
    this.seekTo(lo)
  }

  /**
   * Change the playback speed.
   * @param intervalMs Milliseconds between bars (lower = faster)
   */
  setSpeed (intervalMs: number): void {
    this._opts.intervalMs = Math.max(50, intervalMs)
    // Restart timer if playing
    if (this._state === 'playing') {
      this._stop()
      this._timer = setInterval(() => {
        this._advance()
      }, this._opts.intervalMs)
    }
  }

  /**
   * Reset replay to the beginning (before initial pre-load position).
   */
  reset (): void {
    this._stop()
    this._cursor = 0
    this._setState('idle')
  }

  /**
   * Stop and clean up. Call when done with this instance.
   */
  destroy (): void {
    this._stop()
    this._bars = []
    this._setState('idle')
  }
}
