import type { Datafeed, SymbolInfo, Period, DatafeedSubscribeCallback, CandleData } from 'astroneum'
import { TickAnimator } from 'astroneum'

// ---------------------------------------------------------------------------
// Mock symbol catalogue
// ---------------------------------------------------------------------------
export const MOCK_SYMBOLS: SymbolInfo[] = [
  { ticker: 'BTCUSDT', name: 'Bitcoin / Tether', shortName: 'BTC', exchange: 'BINANCE', market: 'crypto', pricePrecision: 2, volumePrecision: 6, priceCurrency: 'USDT', type: 'crypto' },
  { ticker: 'ETHUSDT', name: 'Ethereum / Tether', shortName: 'ETH', exchange: 'BINANCE', market: 'crypto', pricePrecision: 2, volumePrecision: 4, priceCurrency: 'USDT', type: 'crypto' },
  { ticker: 'SOLUSDT', name: 'Solana / Tether', shortName: 'SOL', exchange: 'BINANCE', market: 'crypto', pricePrecision: 2, volumePrecision: 2, priceCurrency: 'USDT', type: 'crypto' },
  { ticker: 'AAPL', name: 'Apple Inc.', shortName: 'AAPL', exchange: 'NASDAQ', market: 'stocks', pricePrecision: 2, volumePrecision: 0, priceCurrency: 'USD', type: 'stock' },
  { ticker: 'TSLA', name: 'Tesla Inc.', shortName: 'TSLA', exchange: 'NASDAQ', market: 'stocks', pricePrecision: 2, volumePrecision: 0, priceCurrency: 'USD', type: 'stock' },
  { ticker: 'NVDA', name: 'NVIDIA Corp.', shortName: 'NVDA', exchange: 'NASDAQ', market: 'stocks', pricePrecision: 2, volumePrecision: 0, priceCurrency: 'USD', type: 'stock' },
]

// ---------------------------------------------------------------------------
// Seeded random — Mulberry32
// ---------------------------------------------------------------------------
function makeRng(seed: number) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SYMBOL_SEEDS: Record<string, number> = {
  BTCUSDT: 42, ETHUSDT: 99, SOLUSDT: 7, AAPL: 123, TSLA: 55, NVDA: 88
}

const SYMBOL_BASE: Record<string, number> = {
  BTCUSDT: 60000, ETHUSDT: 3000, SOLUSDT: 170, AAPL: 185, TSLA: 250, NVDA: 900
}

function periodMs(period: Period): number {
  const map: Record<string, number> = {
    second: 1_000, minute: 60_000, hour: 3_600_000, day: 86_400_000,
    week: 604_800_000, month: 2_592_000_000, year: 31_536_000_000,
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
    const change1 = (rng() - 0.5) * volatility
    const change2 = (rng() - 0.5) * volatility
    const change3 = (rng() - 0.5) * volatility
    const close = open + change1
    const high = Math.max(open, close) + Math.abs(change2)
    const low = Math.min(open, close) - Math.abs(change3)
    const volume = base * (0.5 + rng() * 2) * 10
    const turnover = volume * ((open + close) / 2)

    if (ts >= from) {
      bars.push({ timestamp: ts, open, high, low, close, volume, turnover })
    }
    price = Math.max(base * 0.05, close)
    ts += step
  }

  return bars
}

const _timers = new Map<string, ReturnType<typeof setInterval>>()
const _lastHistoryClose = new Map<string, number>()
const _animators = new Map<string, TickAnimator>()

// Use a chart-like real-time cadence (~8 Hz) instead of ultra-high frequency.
const TARGET_TICK_INTERVAL_MS = 125
const BASELINE_TICK_INTERVAL_MS = 125
const VISUAL_INTERPOLATION_MS = 140

interface StreamState {
  barTs: number
  bar: CandleData
}

const _streamState = new Map<string, StreamState>()

function tickKey(symbol: SymbolInfo, period: Period) {
  return `${symbol.ticker}::${period.text}`
}

const MockDatafeed: Datafeed = {
  searchSymbols(search = '') {
    const q = search.toLowerCase()
    return Promise.resolve(
      MOCK_SYMBOLS.filter(s =>
        !q ||
        s.ticker.toLowerCase().includes(q) ||
        (s.name ?? '').toLowerCase().includes(q)
      )
    )
  },

  getHistoryData(symbol, period, from, to) {
    const bars = generateBars(symbol.ticker, period, from, to)
    if (bars.length > 0) {
      _lastHistoryClose.set(tickKey(symbol, period), bars[bars.length - 1].close)
    }
    return Promise.resolve(bars)
  },

  subscribe(symbol, period, callback: DatafeedSubscribeCallback) {
    const key = tickKey(symbol, period)
    if (_timers.has(key)) return

    // Interpolate each incoming tick to rAF frames so motion stays continuous.
    const animator = new TickAnimator(callback, {
      duration: VISUAL_INTERPOLATION_MS,
      easing: 'linear'
    })
    _animators.set(key, animator)

    const step = periodMs(period)
    const intervalMs = Math.min(step, TARGET_TICK_INTERVAL_MS)
    const tickScale = Math.max(intervalMs / BASELINE_TICK_INTERVAL_MS, 0.001)
    const base = SYMBOL_BASE[symbol.ticker] ?? 100

    const createBar = (barTs: number, open: number): CandleData => ({
      timestamp: barTs,
      open,
      high: open,
      low: open,
      close: open,
      volume: 0,
      turnover: 0,
    })

    const timer = setInterval(() => {
      const now = Date.now()
      const barTs = Math.floor(now / step) * step
      let state = _streamState.get(key)

      if (state === undefined) {
        const seedPrice = _lastHistoryClose.get(key) ?? base
        state = { barTs, bar: createBar(barTs, seedPrice) }
        _streamState.set(key, state)
      }

      if (state.barTs !== barTs) {
        const nextOpen = state.bar.close
        state = { barTs, bar: createBar(barTs, nextOpen) }
        _streamState.set(key, state)
      }

      // Keep intra-bar ticks realistic: gentle mean reversion toward bar open
      // plus bounded micro-noise, instead of hard pull to a static base price.
      const priceScale = Math.max(state.bar.open, base, 1)
      const pullToOpen = (state.bar.open - state.bar.close) * 0.01 * tickScale
      const noise = (Math.random() - 0.5) * priceScale * 0.0006 * Math.sqrt(tickScale)
      const rawDelta = pullToOpen + noise
      const maxStep = priceScale * 0.0015 * tickScale
      const boundedDelta = Math.max(-maxStep, Math.min(maxStep, rawDelta))
      const nextClose = Math.max(priceScale * 0.02, state.bar.close + boundedDelta)
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
      animator.feed(tick)
    }, intervalMs)

    _timers.set(key, timer)
  },

  unsubscribe(symbol, period) {
    const key = tickKey(symbol, period)
    const timer = _timers.get(key)
    if (timer !== undefined) {
      clearInterval(timer)
      _timers.delete(key)
    }
    const animator = _animators.get(key)
    if (animator !== undefined) {
      animator.cancel()
      _animators.delete(key)
    }
    _streamState.delete(key)
  },
}

export default MockDatafeed
