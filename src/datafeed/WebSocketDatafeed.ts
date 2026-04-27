import type { Datafeed, SymbolInfo, Period, DatafeedSubscribeCallback, CandleData } from '@/types'
import { TickAnimator } from '@/engine/common/TickAnimator'

// ---------------------------------------------------------------------------
// WebSocketDatafeed
//
// A base class that handles all the WebSocket boilerplate for you:
// - Automatic reconnection with exponential backoff
// - TickAnimator for smooth real-time rendering
// - Per-symbol/period subscription key management
// - Clean unsubscribe / teardown
//
// You only need to implement 3 methods in your subclass:
//
//   1. getHistoryBars(symbol, period, from, to): Promise<CandleData[]>
//      → Fetch historical bars from your REST API
//
//   2. getWebSocketUrl(symbol, period): string
//      → Return the WebSocket URL for the given symbol/period pair
//
//   3. parseMessage(event: MessageEvent, symbol, period): CandleData | null
//      → Parse a raw WebSocket message; return a CandleData tick or null to skip
//
// Optionally override:
//   - searchSymbols(search)     → Default returns []
//   - onOpen(ws, symbol, period) → Send subscribe frames after connect (e.g. Binance topic)
//   - smoothingDuration          → Duration (ms) for TickAnimator interpolation (default: 140)
//   - reconnectBaseMs            → Base delay for reconnect (default: 1000)
//   - reconnectMaxMs             → Max reconnect delay (default: 30000)
//
// ---------------------------------------------------------------------------
// QUICK START — Binance example:
//
//   class BinanceDatafeed extends WebSocketDatafeed {
//     async getHistoryBars(symbol, period, from, to) {
//       const interval = this.toInterval(period) // '1m', '5m', '1h', etc.
//       const res = await fetch(
//         `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol.ticker}&interval=${interval}&startTime=${from}&endTime=${to}&limit=1000`
//       )
//       const rows: any[][] = await res.json()
//       return rows.map(r => ({
//         timestamp: r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5], turnover: +r[7]
//       }))
//     }
//
//     getWebSocketUrl(symbol, period) {
//       const interval = this.toInterval(period)
//       return `wss://fstream.binance.com/ws/${symbol.ticker.toLowerCase()}@kline_${interval}`
//     }
//
//     parseMessage(event, symbol, period) {
//       try {
//         const data = JSON.parse(event.data)
//         if (data.e !== 'kline') return null
//         return { timestamp: data.k.t, open: +data.k.o, high: +data.k.h, low: +data.k.l, close: +data.k.c, volume: +data.k.v, turnover: +data.k.q }
//       } catch { return null }
//     }
//   }
// ---------------------------------------------------------------------------

export interface WebSocketDatafeedOptions {
  /**
   * Duration in milliseconds for TickAnimator smooth interpolation.
   * Set to 0 to disable smoothing. Default: 140
   */
  smoothingDuration?: number
  /**
   * Base reconnect delay in ms (doubles on each failure). Default: 1000
   */
  reconnectBaseMs?: number
  /**
   * Maximum reconnect delay in ms. Default: 30000
   */
  reconnectMaxMs?: number
}

export abstract class WebSocketDatafeed implements Datafeed {
  protected readonly smoothingDuration: number
  protected readonly reconnectBaseMs: number
  protected readonly reconnectMaxMs: number

  private readonly _sockets = new Map<string, WebSocket>()
  private readonly _animators = new Map<string, TickAnimator>()
  private readonly _reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly _reconnectDelays = new Map<string, number>()
  private readonly _manualClose = new Set<string>()

  constructor(options: WebSocketDatafeedOptions = {}) {
    this.smoothingDuration = options.smoothingDuration ?? 140
    this.reconnectBaseMs = options.reconnectBaseMs ?? 1_000
    this.reconnectMaxMs = options.reconnectMaxMs ?? 30_000
  }

  // -------------------------------------------------------------------------
  // Abstract methods — implement these in your subclass
  // -------------------------------------------------------------------------

  /** Fetch historical OHLCV bars from your REST API. */
  abstract getHistoryBars(
    symbol: SymbolInfo,
    period: Period,
    from: number,
    to: number
  ): Promise<CandleData[]>

  /**
   * Return the WebSocket URL for the given symbol/period.
   * Called on every (re)connect.
   */
  abstract getWebSocketUrl(symbol: SymbolInfo, period: Period): string

  /**
   * Parse a raw WebSocket MessageEvent.
   * Return a CandleData object to emit a tick, or null to ignore the message.
   */
  abstract parseMessage(
    event: MessageEvent,
    symbol: SymbolInfo,
    period: Period
  ): CandleData | null

  // -------------------------------------------------------------------------
  // Optional overrides
  // -------------------------------------------------------------------------

  /** Optionally override to search your symbol catalogue. Default returns []. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  searchSymbols(_search?: string): Promise<SymbolInfo[]> {
    return Promise.resolve([])
  }

  /**
   * Called immediately after a WebSocket connection opens.
   * Override to send a subscription frame (e.g., Binance topic subscribe JSON).
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected onOpen(_ws: WebSocket, _symbol: SymbolInfo, _period: Period): void {
    // no-op by default
  }

  // -------------------------------------------------------------------------
  // Datafeed interface — do NOT override these
  // -------------------------------------------------------------------------

  getHistoryData(symbol: SymbolInfo, period: Period, from: number, to: number): Promise<CandleData[]> {
    return this.getHistoryBars(symbol, period, from, to)
  }

  subscribe(symbol: SymbolInfo, period: Period, callback: DatafeedSubscribeCallback): void {
    const key = this._key(symbol, period)

    // Tear down any existing subscription for this key
    this._cleanup(key)

    const animator = this.smoothingDuration > 0
      ? new TickAnimator(callback, { duration: this.smoothingDuration, easing: 'linear' })
      : null
    if (animator) this._animators.set(key, animator)

    const emit = (tick: CandleData): void => {
      if (animator) animator.feed(tick)
      else callback(tick)
    }

    this._connect(symbol, period, key, emit)
  }

  unsubscribe(symbol: SymbolInfo, period: Period): void {
    this._cleanup(this._key(symbol, period))
  }

  // -------------------------------------------------------------------------
  // Utility helpers available to subclasses
  // -------------------------------------------------------------------------

  /**
   * Convert a Period to a Binance-style interval string ('1m', '5m', '1h', etc.)
   * Returns null if the multiplier is not a standard Binance interval.
   */
  protected toInterval(period: Period): string | null {
    const suffix: Record<string, string> = {
      second: 's', minute: 'm', hour: 'h', day: 'd', week: 'w', month: 'M'
    }
    const s = suffix[period.timespan]
    if (!s) return null
    return `${period.multiplier}${s}`
  }

  /** Period duration in milliseconds. */
  protected periodMs(period: Period): number {
    const ms: Record<string, number> = {
      second: 1_000, minute: 60_000, hour: 3_600_000,
      day: 86_400_000, week: 604_800_000, month: 2_592_000_000, year: 31_536_000_000,
    }
    return (ms[period.timespan] ?? 60_000) * period.multiplier
  }

  // -------------------------------------------------------------------------
  // Internal WebSocket lifecycle
  // -------------------------------------------------------------------------

  private _key(symbol: SymbolInfo, period: Period): string {
    return `${symbol.ticker}::${period.text}`
  }

  private _connect(
    symbol: SymbolInfo,
    period: Period,
    key: string,
    emit: (tick: CandleData) => void
  ): void {
    const url = this.getWebSocketUrl(symbol, period)
    const ws = new WebSocket(url)
    this._sockets.set(key, ws)

    ws.onopen = () => {
      this._reconnectDelays.set(key, this.reconnectBaseMs)
      this.onOpen(ws, symbol, period)
    }

    ws.onmessage = (event) => {
      try {
        const tick = this.parseMessage(event, symbol, period)
        if (tick !== null) emit(tick)
      } catch {
        // Ignore malformed messages
      }
    }

    ws.onerror = () => {
      ws.close()
    }

    ws.onclose = () => {
      this._sockets.delete(key)
      if (this._manualClose.has(key)) {
        this._manualClose.delete(key)
        return
      }
      this._scheduleReconnect(symbol, period, key, emit)
    }
  }

  private _scheduleReconnect(
    symbol: SymbolInfo,
    period: Period,
    key: string,
    emit: (tick: CandleData) => void
  ): void {
    if (this._reconnectTimers.has(key) || this._manualClose.has(key)) return

    const delay = this._reconnectDelays.get(key) ?? this.reconnectBaseMs
    this._reconnectDelays.set(key, Math.min(delay * 2, this.reconnectMaxMs))

    const timer = setTimeout(() => {
      this._reconnectTimers.delete(key)
      if (!this._manualClose.has(key)) {
        this._connect(symbol, period, key, emit)
      }
    }, delay)

    this._reconnectTimers.set(key, timer)
  }

  private _cleanup(key: string): void {
    const ws = this._sockets.get(key)
    if (ws) {
      this._manualClose.add(key)
      ws.close()
      this._sockets.delete(key)
    }

    const timer = this._reconnectTimers.get(key)
    if (timer !== undefined) {
      clearTimeout(timer)
      this._reconnectTimers.delete(key)
    }

    const animator = this._animators.get(key)
    if (animator) {
      animator.cancel()
      this._animators.delete(key)
    }

    this._reconnectDelays.delete(key)
  }
}
