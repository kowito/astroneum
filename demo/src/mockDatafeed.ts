/**
 * MOCK DATAFEED FOR ASTRONEUM DEMO
 *
 * This is a **feature-rich demo datafeed** for testing the chart with:
 * - Real Binance perpetual futures data (REST + WebSocket)
 * - Local synthetic fallback (for offline testing)
 * - Smooth tick interpolation (TickAnimator)
 * - Realistic intra-bar price action
 *
 * ⚠️ **For your own implementation**, see docs/datafeed-guide.md for patterns.
 * Start with Pattern 1 (minimal mock) or Pattern 2 (REST API polling).
 * Only add complexity like WebSockets and TickAnimator when you need real-time smoothness.
 */

import type { Datafeed, SymbolInfo, Period, DatafeedSubscribeCallback, CandleData } from 'astroneum'
import { TickAnimator } from 'astroneum'

// ============================================================================
// SYMBOL & PRICE GENERATION HELPERS (skip if you're reading from a live feed)
// ============================================================================

// ---------------------------------------------------------------------------
// Mock symbol catalogue
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

const BINANCE_WS_BASE_URL = 'wss://fstream.binance.com/ws'
const BINANCE_REST_BASE_URL = 'https://fapi.binance.com/fapi/v1'
const BINANCE_CRYPTO_TICKERS = new Set(
  MOCK_SYMBOLS
    .filter(symbol => symbol.exchange === 'BINANCE' && symbol.type === 'crypto')
    .map(symbol => symbol.ticker.toUpperCase())
)

type BinanceTimespan = Extract<Period['timespan'], 'minute' | 'hour' | 'day' | 'week' | 'month'>

const BINANCE_INTERVAL_MULTIPLIERS: Record<BinanceTimespan, ReadonlySet<number>> = {
  minute: new Set([1, 3, 5, 15, 30]),
  hour: new Set([1, 2, 4, 6, 8, 12]),
  day: new Set([1, 3]),
  week: new Set([1]),
  month: new Set([1]),
}

function isBinanceSupportedSymbol(symbol: SymbolInfo): boolean {
  return BINANCE_CRYPTO_TICKERS.has(symbol.ticker.toUpperCase())
}

function toBinanceInterval(period: Period): string | null {
  const timespan = period.timespan as BinanceTimespan
  const supportedMultipliers = BINANCE_INTERVAL_MULTIPLIERS[timespan]
  if (!supportedMultipliers?.has(period.multiplier)) return null

  const suffixMap: Record<BinanceTimespan, string> = {
    minute: 'm',
    hour: 'h',
    day: 'd',
    week: 'w',
    month: 'M',
  }
  return `${period.multiplier}${suffixMap[timespan]}`
}

function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

type BinanceRestKline = [
  openTime: number,
  open: string,
  high: string,
  low: string,
  close: string,
  volume: string,
  closeTime: number,
  quoteAssetVolume: string,
  numberOfTrades: number,
  takerBuyBaseVolume: string,
  takerBuyQuoteVolume: string,
  ignore: string
]

interface BinanceWsKlineEvent {
  e: string
  k: {
    t: number
    o: string
    h: string
    l: string
    c: string
    v: string
    q: string
  }
}

function toCandleFromBinanceRest(kline: BinanceRestKline): CandleData {
  return {
    timestamp: toNumber(kline[0]),
    open: toNumber(kline[1]),
    high: toNumber(kline[2]),
    low: toNumber(kline[3]),
    close: toNumber(kline[4]),
    volume: toNumber(kline[5]),
    turnover: toNumber(kline[7]),
  }
}

function toCandleFromBinanceWs(event: BinanceWsKlineEvent): CandleData {
  return {
    timestamp: toNumber(event.k.t),
    open: toNumber(event.k.o),
    high: toNumber(event.k.h),
    low: toNumber(event.k.l),
    close: toNumber(event.k.c),
    volume: toNumber(event.k.v),
    turnover: toNumber(event.k.q),
  }
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
const _sockets = new Map<string, WebSocket>()
const _manualSocketClose = new Set<string>()
const _socketReconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()
const _socketReconnectDelayMs = new Map<string, number>()

// ============================================================================
// DATAFEED IMPLEMENTATION
// The core interface: searchSymbols, getHistoryData, subscribe, unsubscribe
// For a simpler example, see docs/datafeed-guide.md Pattern 1–3
// ============================================================================

const BINANCE_RECONNECT_BASE_MS = 1_000
const BINANCE_RECONNECT_MAX_MS = 30_000
const MIN_MAIN_INDICATOR_WARMUP_BARS = 120

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
    const key = tickKey(symbol, period)
    const interval = toBinanceInterval(period)

    if (isBinanceSupportedSymbol(symbol) && interval !== null) {
      const symbolCode = symbol.ticker.toUpperCase()
      const primaryUrl = new URL(`${BINANCE_REST_BASE_URL}/klines`)
      primaryUrl.searchParams.set('symbol', symbolCode)
      primaryUrl.searchParams.set('interval', interval)
      primaryUrl.searchParams.set('startTime', `${Math.max(0, Math.floor(from))}`)
      primaryUrl.searchParams.set('endTime', `${Math.max(0, Math.floor(to))}`)
      primaryUrl.searchParams.set('limit', '1000')

      const backfillUrl = new URL(`${BINANCE_REST_BASE_URL}/klines`)
      backfillUrl.searchParams.set('symbol', symbolCode)
      backfillUrl.searchParams.set('interval', interval)
      backfillUrl.searchParams.set('endTime', `${Math.max(0, Math.floor(to))}`)
      backfillUrl.searchParams.set('limit', '1000')

      const fetchBars = async (url: URL): Promise<CandleData[]> => {
        const response = await fetch(url.toString())
        if (!response.ok) {
          throw new Error(`Binance history failed: ${response.status}`)
        }
        const rows = await response.json() as BinanceRestKline[]
        return rows
          .map(toCandleFromBinanceRest)
          .sort((a, b) => a.timestamp - b.timestamp)
      }

      return fetchBars(primaryUrl)
        .then(async primaryBars => {
          let bars = primaryBars.filter(bar => bar.timestamp >= from && bar.timestamp <= to)

          // Ensure enough warm-up bars for longer EMAs (e.g. EMA99)
          // while keeping data source strictly on Binance perpetual futures.
          if (bars.length < MIN_MAIN_INDICATOR_WARMUP_BARS) {
            try {
              const backfillBars = await fetchBars(backfillUrl)
              if (backfillBars.length > bars.length) {
                bars = backfillBars.filter(bar => bar.timestamp <= to)
              }
            } catch {
              // Keep primary result when backfill fails.
            }
          }

          if (bars.length > 0) {
            _lastHistoryClose.set(key, bars[bars.length - 1].close)
          }
          return bars
        })
        .catch(async () => {
          // Keep this path strict to perpetual futures data.
          // If range fetch fails, do one Binance-only backfill attempt.
          try {
            const fallbackBars = await fetchBars(backfillUrl)
            if (fallbackBars.length > 0) {
              _lastHistoryClose.set(key, fallbackBars[fallbackBars.length - 1].close)
            }
            return fallbackBars
          } catch {
            return []
          }
        })
    }

    const bars = generateBars(symbol.ticker, period, from, to)
    if (bars.length > 0) {
      _lastHistoryClose.set(key, bars[bars.length - 1].close)
    }
    return Promise.resolve(bars)
  },

  subscribe(symbol, period, callback: DatafeedSubscribeCallback) {
    const key = tickKey(symbol, period)
    const existingTimer = _timers.get(key)
    if (existingTimer !== undefined) {
      clearInterval(existingTimer)
      _timers.delete(key)
    }
    const existingAnimator = _animators.get(key)
    if (existingAnimator !== undefined) {
      existingAnimator.cancel()
      _animators.delete(key)
    }
    const existingSocket = _sockets.get(key)
    if (existingSocket !== undefined) {
      _manualSocketClose.add(key)
      existingSocket.close()
      _sockets.delete(key)
    }
    const reconnectTimer = _socketReconnectTimers.get(key)
    if (reconnectTimer !== undefined) {
      clearTimeout(reconnectTimer)
      _socketReconnectTimers.delete(key)
    }
    _socketReconnectDelayMs.delete(key)

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

    const startLocalSimulation = (): void => {
      const timer = setInterval(() => {
        const now = Date.now()
        const barTs = Math.floor(now / step) * step
        let state = _streamState.get(key)
        let startedNewBar = false

        if (state === undefined) {
          const seedPrice = _lastHistoryClose.get(key) ?? base
          state = { barTs, bar: createBar(barTs, seedPrice) }
          _streamState.set(key, state)
        }

        if (state.barTs !== barTs) {
          const nextOpen = state.bar.close
          state = { barTs, bar: createBar(barTs, nextOpen) }
          _streamState.set(key, state)
          startedNewBar = true
        }

        // Keep intra-bar ticks realistic: gentle mean reversion toward bar open
        // plus bounded micro-noise, instead of hard pull to a static base price.
        const priceScale = Math.max(state.bar.open, base, 1)
        const pullToOpen = (state.bar.open - state.bar.close) * 0.01 * tickScale
        const noise = (Math.random() - 0.5) * priceScale * 0.0006 * Math.sqrt(tickScale)
        const rawDelta = pullToOpen + noise
        const maxStep = priceScale * 0.0015 * tickScale
        let boundedDelta = Math.max(-maxStep, Math.min(maxStep, rawDelta))
        // Avoid emitting a perfectly flat first print on a new bar in the demo feed.
        // This keeps the bar shape realistic when the boundary tick is appended immediately.
        if (startedNewBar && Math.abs(boundedDelta) < priceScale * 1e-8) {
          boundedDelta = (Math.random() < 0.5 ? -1 : 1) * priceScale * 0.00005
        }
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

        if (startedNewBar) {
          // Emit the first trade tick of the new bar immediately so append happens
          // without creating a synthetic flat O=H=L=C placeholder bar.
          callback(tick)
        }

        state.bar = tick
        _lastHistoryClose.set(key, tick.close)
        animator.feed(tick)
      }, intervalMs)

      _timers.set(key, timer)
    }

    const interval = toBinanceInterval(period)
    if (isBinanceSupportedSymbol(symbol) && interval !== null) {
      const scheduleReconnect = (): void => {
        if (_socketReconnectTimers.has(key) || _manualSocketClose.has(key)) return
        const delay = _socketReconnectDelayMs.get(key) ?? BINANCE_RECONNECT_BASE_MS
        _socketReconnectDelayMs.set(key, Math.min(delay * 2, BINANCE_RECONNECT_MAX_MS))

        const timer = setTimeout(() => {
          _socketReconnectTimers.delete(key)
          if (_manualSocketClose.has(key)) return
          openBinanceSocket()
        }, delay)
        _socketReconnectTimers.set(key, timer)
      }

      const openBinanceSocket = (): void => {
        const socket = new WebSocket(`${BINANCE_WS_BASE_URL}/${symbol.ticker.toLowerCase()}@kline_${interval}`)
        _sockets.set(key, socket)

        socket.onopen = (): void => {
          _socketReconnectDelayMs.set(key, BINANCE_RECONNECT_BASE_MS)
        }

        socket.onmessage = (event): void => {
          try {
            const payload = JSON.parse(event.data as string) as BinanceWsKlineEvent
            if (payload.e !== 'kline') return

            const tick = toCandleFromBinanceWs(payload)
            const prevState = _streamState.get(key)
            const startedNewBar = prevState !== undefined && prevState.barTs !== tick.timestamp
            _streamState.set(key, { barTs: tick.timestamp, bar: tick })
            _lastHistoryClose.set(key, tick.close)

            if (startedNewBar) {
              callback(tick)
            }
            animator.feed(tick)
          } catch {
            // Ignore malformed messages and keep stream alive.
          }
        }

        socket.onerror = (): void => {
          socket.close()
        }

        socket.onclose = (): void => {
          _sockets.delete(key)
          if (_manualSocketClose.has(key)) {
            _manualSocketClose.delete(key)
            return
          }
          scheduleReconnect()
        }
      }

      _socketReconnectDelayMs.set(key, BINANCE_RECONNECT_BASE_MS)
      openBinanceSocket()

      return
    }

    startLocalSimulation()
  },

  unsubscribe(symbol, period) {
    const key = tickKey(symbol, period)
    const symbolPrefix = `${symbol.ticker}::`
    const keys = _timers.has(key)
      ? [key]
      : [..._timers.keys()].filter(k => k.startsWith(symbolPrefix))

    keys.forEach(k => {
      const timer = _timers.get(k)
      if (timer !== undefined) {
        clearInterval(timer)
        _timers.delete(k)
      }
      const animator = _animators.get(k)
      if (animator !== undefined) {
        animator.cancel()
        _animators.delete(k)
      }
      const socket = _sockets.get(k)
      if (socket !== undefined) {
        _manualSocketClose.add(k)
        socket.close()
        _sockets.delete(k)
      }
      const reconnectTimer = _socketReconnectTimers.get(k)
      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer)
        _socketReconnectTimers.delete(k)
      }
      _socketReconnectDelayMs.delete(k)
      _streamState.delete(k)
    })
  },
}

export default MockDatafeed
