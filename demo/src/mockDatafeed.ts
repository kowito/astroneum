/**
 * MOCK DATAFEED FOR ASTRONEUM DEMO
 *
 * This demonstrates how to use WebSocketDatafeed from `astroneum`:
 * - Real Binance perpetual futures data (REST + WebSocket)
 * - Local synthetic fallback for non-crypto or offline
 * - Smooth tick interpolation (handled by WebSocketDatafeed base)
 *
 * ⚠️ For your own implementation, see docs/datafeed-guide.md
 * The WebSocketDatafeed base class removes the boilerplate — you only
 * implement getHistoryBars(), getWebSocketUrl(), and parseMessage().
 */

import type { SymbolInfo, Period, DatafeedSubscribeCallback, CandleData } from 'astroneum'
import { WebSocketDatafeed } from 'astroneum'

// ---------------------------------------------------------------------------
// Symbol catalogue
// ---------------------------------------------------------------------------

export const MOCK_SYMBOLS: SymbolInfo[] = [
  { ticker: 'BTCUSDT', name: 'Bitcoin Perpetual / USDT', shortName: 'BTC PERP', exchange: 'BINANCE', market: 'crypto', pricePrecision: 2, volumePrecision: 6, priceCurrency: 'USDT', type: 'crypto' },
  { ticker: 'ETHUSDT', name: 'Ethereum Perpetual / USDT', shortName: 'ETH PERP', exchange: 'BINANCE', market: 'crypto', pricePrecision: 2, volumePrecision: 4, priceCurrency: 'USDT', type: 'crypto' },
  { ticker: 'SOLUSDT', name: 'Solana Perpetual / USDT', shortName: 'SOL PERP', exchange: 'BINANCE', market: 'crypto', pricePrecision: 2, volumePrecision: 2, priceCurrency: 'USDT', type: 'crypto' },
  { ticker: 'AAPL', name: 'Apple Inc.', shortName: 'AAPL', exchange: 'NASDAQ', market: 'stocks', pricePrecision: 2, volumePrecision: 0, priceCurrency: 'USD', type: 'stock' },
  { ticker: 'TSLA', name: 'Tesla Inc.', shortName: 'TSLA', exchange: 'NASDAQ', market: 'stocks', pricePrecision: 2, volumePrecision: 0, priceCurrency: 'USD', type: 'stock' },
  { ticker: 'NVDA', name: 'NVIDIA Corp.', shortName: 'NVDA', exchange: 'NASDAQ', market: 'stocks', pricePrecision: 2, volumePrecision: 0, priceCurrency: 'USD', type: 'stock' },
]

// ---------------------------------------------------------------------------
// Binance interval mapping
// ---------------------------------------------------------------------------

const BINANCE_WS_BASE_URL = 'wss://fstream.binance.com/ws'
const BINANCE_REST_BASE_URL = 'https://fapi.binance.com/fapi/v1'

type BinanceTimespan = Extract<Period['timespan'], 'minute' | 'hour' | 'day' | 'week' | 'month'>

const BINANCE_SUPPORTED_INTERVALS: Record<BinanceTimespan, ReadonlySet<number>> = {
  minute: new Set([1, 3, 5, 15, 30]),
  hour: new Set([1, 2, 4, 6, 8, 12]),
  day: new Set([1, 3]),
  week: new Set([1]),
  month: new Set([1]),
}

const BINANCE_CRYPTO_TICKERS = new Set(
  MOCK_SYMBOLS.filter(s => s.exchange === 'BINANCE').map(s => s.ticker.toUpperCase())
)

function toBinanceInterval(period: Period): string | null {
  const ts = period.timespan as BinanceTimespan
  if (!BINANCE_SUPPORTED_INTERVALS[ts]?.has(period.multiplier)) return null
  const suffix: Record<BinanceTimespan, string> = {
    minute: 'm', hour: 'h', day: 'd', week: 'w', month: 'M',
  }
  return `${period.multiplier}${suffix[ts]}`
}

function isBinanceSymbol(symbol: SymbolInfo): boolean {
  return BINANCE_CRYPTO_TICKERS.has(symbol.ticker.toUpperCase())
}

// ---------------------------------------------------------------------------
// Binance response types (minimal)
// ---------------------------------------------------------------------------

type BinanceRestKline = [
  openTime: number, open: string, high: string, low: string, close: string,
  volume: string, closeTime: number, quoteVolume: string,
  trades: number, takerBase: string, takerQuote: string, ignore: string
]

interface BinanceWsKlineEvent {
  e: string
  k: { t: number; o: string; h: string; l: string; c: string; v: string; q: string }
}

// ---------------------------------------------------------------------------
// Synthetic fallback (for non-Binance symbols / offline)
// ---------------------------------------------------------------------------

function makeRng(seed: number) {
  return () => {
    seed |= 0
    seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SYMBOL_SEEDS: Record<string, number> = { BTCUSDT: 42, ETHUSDT: 99, SOLUSDT: 7, AAPL: 123, TSLA: 55, NVDA: 88 }
const SYMBOL_BASE: Record<string, number> = { BTCUSDT: 60000, ETHUSDT: 3000, SOLUSDT: 170, AAPL: 185, TSLA: 250, NVDA: 900 }

function periodMs(period: Period): number {
  const map: Record<string, number> = {
    second: 1_000, minute: 60_000, hour: 3_600_000,
    day: 86_400_000, week: 604_800_000, month: 2_592_000_000, year: 31_536_000_000,
  }
  return (map[period.timespan] ?? 60_000) * period.multiplier
}

function generateBars(ticker: string, period: Period, from: number, to: number): CandleData[] {
  const rng = makeRng(SYMBOL_SEEDS[ticker] ?? 1)
  const base = SYMBOL_BASE[ticker] ?? 100
  const step = periodMs(period)
  const volatility = base * 0.012
  const historyStart = Math.floor((to - step * 2000) / step) * step
  const startTs = Math.max(from - step, historyStart)

  let price = base
  const warmup = Math.max(0, Math.floor((startTs - historyStart) / step))
  for (let i = 0; i < warmup; i++) {
    price += (rng() - 0.5) * volatility
    if (price < base * 0.1) price = base * 0.1
  }

  const bars: CandleData[] = []
  let ts = Math.floor(startTs / step) * step
  while (ts <= to) {
    const open = price
    const c1 = (rng() - 0.5) * volatility
    const c2 = (rng() - 0.5) * volatility
    const c3 = (rng() - 0.5) * volatility
    const close = open + c1
    const volume = base * (0.5 + rng() * 2) * 10
    if (ts >= from) {
      bars.push({
        timestamp: ts,
        open,
        high: Math.max(open, close) + Math.abs(c2),
        low: Math.min(open, close) - Math.abs(c3),
        close,
        volume,
        turnover: volume * ((open + close) / 2),
      })
    }
    price = Math.max(base * 0.05, close)
    ts += step
  }
  return bars
}

// ---------------------------------------------------------------------------
// MockDatafeed — extends WebSocketDatafeed
//
// All WebSocket connection management, reconnection logic, and TickAnimator
// are handled by the base class. This class only contains business logic
// specific to Binance + our demo symbols.
// ---------------------------------------------------------------------------

const MIN_WARMUP_BARS = 120
const TARGET_TICK_MS = 125

class MockDatafeedImpl extends WebSocketDatafeed {
  private readonly _lastClose = new Map<string, number>()
  private readonly _localTimers = new Map<string, ReturnType<typeof setInterval>>()

  constructor() {
    super({ smoothingDuration: 140 })
  }

  override searchSymbols(search = ''): Promise<SymbolInfo[]> {
    const q = search.toLowerCase()
    return Promise.resolve(
      MOCK_SYMBOLS.filter(s =>
        !q || s.ticker.toLowerCase().includes(q) || (s.name ?? '').toLowerCase().includes(q)
      )
    )
  }

  // -------------------------------------------------------------------------
  // History: real Binance data with synthetic fallback
  // -------------------------------------------------------------------------

  async getHistoryBars(symbol: SymbolInfo, period: Period, from: number, to: number): Promise<CandleData[]> {
    const key = `${symbol.ticker}::${period.text}`
    const interval = toBinanceInterval(period)

    if (isBinanceSymbol(symbol) && interval !== null) {
      const bars = await this._fetchBinanceBars(symbol.ticker, interval, from, to)
      if (bars.length > 0) this._lastClose.set(key, bars[bars.length - 1].close)
      return bars
    }

    const bars = generateBars(symbol.ticker, period, from, to)
    if (bars.length > 0) this._lastClose.set(key, bars[bars.length - 1].close)
    return bars
  }

  private async _fetchBinanceBars(ticker: string, interval: string, from: number, to: number): Promise<CandleData[]> {
    const buildUrl = (startTime?: number): string => {
      const url = new URL(`${BINANCE_REST_BASE_URL}/klines`)
      url.searchParams.set('symbol', ticker.toUpperCase())
      url.searchParams.set('interval', interval)
      if (startTime !== undefined) url.searchParams.set('startTime', `${Math.floor(startTime)}`)
      url.searchParams.set('endTime', `${Math.floor(to)}`)
      url.searchParams.set('limit', '1000')
      return url.toString()
    }

    const parse = async (url: string): Promise<CandleData[]> => {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Binance ${res.status}`)
      const rows = await res.json() as BinanceRestKline[]
      return rows.map(r => ({
        timestamp: r[0], open: +r[1], high: +r[2], low: +r[3],
        close: +r[4], volume: +r[5], turnover: +r[7],
      }))
    }

    try {
      let bars = (await parse(buildUrl(from))).filter(b => b.timestamp >= from && b.timestamp <= to)
      if (bars.length < MIN_WARMUP_BARS) {
        try {
          const full = await parse(buildUrl())
          if (full.length > bars.length) bars = full.filter(b => b.timestamp <= to)
        } catch { /* keep primary result */ }
      }
      return bars
    } catch {
      try { return await parse(buildUrl()) }
      catch { return [] }
    }
  }

  // -------------------------------------------------------------------------
  // WebSocket: Binance perps stream, or local simulation fallback
  // -------------------------------------------------------------------------

  override getWebSocketUrl(symbol: SymbolInfo, period: Period): string {
    const interval = toBinanceInterval(period)
    if (isBinanceSymbol(symbol) && interval !== null) {
      return `${BINANCE_WS_BASE_URL}/${symbol.ticker.toLowerCase()}@kline_${interval}`
    }
    // Non-Binance symbols use local simulation (subscribe is overridden below)
    return 'wss://invalid'
  }

  override parseMessage(event: MessageEvent, _symbol: SymbolInfo, _period: Period): CandleData | null {
    try {
      const data = JSON.parse(event.data as string) as BinanceWsKlineEvent
      if (data.e !== 'kline') return null
      return {
        timestamp: data.k.t, open: +data.k.o, high: +data.k.h,
        low: +data.k.l, close: +data.k.c, volume: +data.k.v, turnover: +data.k.q,
      }
    } catch {
      return null
    }
  }

  override subscribe(symbol: SymbolInfo, period: Period, callback: DatafeedSubscribeCallback): void {
    const interval = toBinanceInterval(period)

    // Use local simulation for non-Binance symbols (stocks, offline demo)
    if (!isBinanceSymbol(symbol) || interval === null) {
      this._startLocalSimulation(symbol, period, callback)
      return
    }

    // Delegate to WebSocketDatafeed base (handles reconnect + TickAnimator)
    super.subscribe(symbol, period, callback)
  }

  override unsubscribe(symbol: SymbolInfo, period: Period): void {
    const key = `${symbol.ticker}::${period.text}`
    const timer = this._localTimers.get(key)
    if (timer !== undefined) {
      clearInterval(timer)
      this._localTimers.delete(key)
      return
    }
    super.unsubscribe(symbol, period)
  }

  // -------------------------------------------------------------------------
  // Local simulation for stocks / offline demo
  // -------------------------------------------------------------------------

  private _startLocalSimulation(
    symbol: SymbolInfo,
    period: Period,
    callback: DatafeedSubscribeCallback
  ): void {
    const key = `${symbol.ticker}::${period.text}`
    const existing = this._localTimers.get(key)
    if (existing !== undefined) clearInterval(existing)

    const step = periodMs(period)
    const base = SYMBOL_BASE[symbol.ticker] ?? 100
    const tickScale = Math.max(TARGET_TICK_MS / step, 0.001)

    interface LocalBar { barTs: number; bar: CandleData }
    let state: LocalBar | null = null

    const timer = setInterval(() => {
      const now = Date.now()
      const barTs = Math.floor(now / step) * step

      if (state === null || state.barTs !== barTs) {
        const open = state?.bar.close ?? (this._lastClose.get(key) ?? base)
        state = { barTs, bar: { timestamp: barTs, open, high: open, low: open, close: open, volume: 0, turnover: 0 } }
        callback(state.bar)
      }

      const priceScale = Math.max(state.bar.open, base, 1)
      const pull = (state.bar.open - state.bar.close) * 0.01 * tickScale
      const noise = (Math.random() - 0.5) * priceScale * 0.0006 * Math.sqrt(tickScale)
      const maxStep = priceScale * 0.0015 * tickScale
      const delta = Math.max(-maxStep, Math.min(maxStep, pull + noise))
      const nextClose = Math.max(priceScale * 0.02, state.bar.close + delta)
      const tradeVolume = base * (0.005 + Math.random() * 0.015) * tickScale

      const tick: CandleData = {
        timestamp: state.barTs,
        open: state.bar.open,
        high: Math.max(state.bar.high, nextClose),
        low: Math.min(state.bar.low, nextClose),
        close: nextClose,
        volume: (state.bar.volume ?? 0) + tradeVolume,
        turnover: (state.bar.turnover ?? 0) + tradeVolume * nextClose,
      }

      state.bar = tick
      this._lastClose.set(key, tick.close)
      callback(tick)
    }, TARGET_TICK_MS)

    this._localTimers.set(key, timer)
  }
}

export default new MockDatafeedImpl()
