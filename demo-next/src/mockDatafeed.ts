import type { Datafeed, SymbolInfo, Period, DatafeedSubscribeCallback, CandleData } from 'astroneum'

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
    return Promise.resolve(generateBars(symbol.ticker, period, from, to))
  },

  subscribe(symbol, period, callback: DatafeedSubscribeCallback) {
    const key = tickKey(symbol, period)
    if (_timers.has(key)) return

    const step = periodMs(period)
    const intervalMs = Math.min(step, 1000)

    const timer = setInterval(() => {
      const now = Date.now()
      const barTs = Math.floor(now / step) * step
      const base = SYMBOL_BASE[symbol.ticker] ?? 100
      const noise = (Math.random() - 0.5) * base * 0.004
      const price = base + noise

      const tick: CandleData = {
        timestamp: barTs,
        open: price - Math.abs(noise) * 0.3,
        high: price + Math.abs(noise) * 0.8,
        low: price - Math.abs(noise) * 0.8,
        close: price,
        volume: base * (0.5 + Math.random()) * 10,
        turnover: base * base * (0.5 + Math.random()),
      }
      callback(tick)
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
  },
}

export default MockDatafeed
