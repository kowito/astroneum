import type { CandleData, Datafeed, Period, SymbolInfo } from 'astroneum'

/**
 * A simulated market for the docs, so examples work offline and never depend on an
 * exchange being reachable. Prices are a deterministic function of time, so the
 * same range always returns the same bars (scrolling back and reloading agree).
 */

export const MOCK_SYMBOLS: SymbolInfo[] = [
  { ticker: 'DEMO', name: 'Demo Market', pricePrecision: 2, volumePrecision: 0 },
  { ticker: 'WAVE', name: 'Wave Index', pricePrecision: 1, volumePrecision: 0 },
]

const BASE: Record<string, number> = { DEMO: 100, WAVE: 2500 }

const UNIT_MS: Record<string, number> = {
  second: 1000,
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
  year: 365 * 86_400_000,
}

export function periodMs(period: Period): number {
  return period.multiplier * (UNIT_MS[period.timespan] ?? 60_000)
}

/** A repeatable number in [0, 1) for an integer. */
function hash(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b)
  x ^= x >>> 13
  x = Math.imul(x, 0xc2b2ae35)
  x ^= x >>> 16
  return (x >>> 0) / 4294967296
}

function priceAt(ticker: string, time: number): number {
  const base = BASE[ticker] ?? 100
  const minutes = time / 60_000
  const wander = 0.045 * Math.sin(minutes / 190) + 0.016 * Math.sin(minutes / 47 + 1) + 0.006 * Math.sin(minutes / 11)
  return base * (1 + wander + 0.0012 * (hash(Math.floor(minutes)) - 0.5))
}

/** One bar starting at `start`. `until` cuts the bar short, for the bar that is still forming. */
function barAt(ticker: string, start: number, length: number, until?: number): CandleData {
  const end = until !== undefined ? Math.min(start + length, until) : start + length
  const samples = 8
  let high = -Infinity
  let low = Infinity
  for (let i = 0; i <= samples; i++) {
    const p = priceAt(ticker, start + (end - start) * (i / samples))
    high = Math.max(high, p)
    low = Math.min(low, p)
  }
  const base = BASE[ticker] ?? 100
  const wick = base * 0.0008 * hash(Math.floor(start / 1000))
  return {
    timestamp: start,
    open: priceAt(ticker, start),
    high: high + wick,
    low: low - wick,
    close: priceAt(ticker, end),
    volume: Math.round(300 + 900 * hash(Math.floor(start / 1000) + 7)),
  }
}

export type MockEvent =
  | { kind: 'search', query: string }
  | { kind: 'history', symbol: string, period: string, from: number, to: number, bars: number }
  | { kind: 'subscribe', symbol: string, period: string }
  | { kind: 'tick', symbol: string, timestamp: number, close: number, newBar: boolean }
  | { kind: 'unsubscribe', symbol: string, period: string }

export interface MockOptions {
  /** Called for every call the chart makes, and every bar sent back. */
  onEvent?: (event: MockEvent) => void
  /** Milliseconds between live updates. Default 700. */
  tickMs?: number
}

export function createMockDatafeed(options: MockOptions = {}): Datafeed {
  const tickMs = options.tickMs ?? 700
  const emit = options.onEvent ?? (() => undefined)
  const timers = new Map<string, ReturnType<typeof setInterval>>()
  const key = (symbol: SymbolInfo, period: Period): string => `${symbol.ticker}|${period.text}`

  return {
    async searchSymbols (query = '') {
      emit({ kind: 'search', query })
      return MOCK_SYMBOLS.filter(s => s.ticker.toLowerCase().includes(query.toLowerCase()) || (s.name ?? '').toLowerCase().includes(query.toLowerCase()))
    },

    async getHistoryData (symbol, period, from, to) {
      const length = periodMs(period)
      const now = Date.now()
      const bars: CandleData[] = []
      const first = Math.ceil(from / length) * length
      for (let t = first; t <= Math.min(to, now) && bars.length < 2000; t += length) {
        bars.push(barAt(symbol.ticker, t, length, t + length > now ? now : undefined))
      }
      emit({ kind: 'history', symbol: symbol.ticker, period: period.text, from, to, bars: bars.length })
      return bars
    },

    subscribe (symbol, period, callback) {
      const k = key(symbol, period)
      const length = periodMs(period)
      clearInterval(timers.get(k))
      emit({ kind: 'subscribe', symbol: symbol.ticker, period: period.text })

      let start = Math.floor(Date.now() / length) * length
      let bar = barAt(symbol.ticker, start, length, Date.now())
      let drift = 0
      timers.set(k, setInterval(() => {
        const now = Date.now()
        const current = Math.floor(now / length) * length
        const newBar = current !== start
        drift = drift * 0.85 + (hash(now) - 0.5) * (BASE[symbol.ticker] ?? 100) * 0.0007
        const close = priceAt(symbol.ticker, now) + drift
        if (newBar) {
          start = current
          bar = { timestamp: start, open: priceAt(symbol.ticker, start), high: close, low: close, close, volume: 0 }
        }
        bar = { ...bar, close, high: Math.max(bar.high, close), low: Math.min(bar.low, close), volume: (bar.volume ?? 0) + 6 }
        emit({ kind: 'tick', symbol: symbol.ticker, timestamp: bar.timestamp, close, newBar })
        callback(bar)
      }, tickMs))
    },

    unsubscribe (symbol, period) {
      const k = key(symbol, period)
      clearInterval(timers.get(k))
      timers.delete(k)
      emit({ kind: 'unsubscribe', symbol: symbol.ticker, period: period.text })
    },
  }
}
