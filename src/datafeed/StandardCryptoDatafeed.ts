import type {
  CandleData,
  Datafeed,
  DatafeedSubscribeCallback,
  Period,
  SymbolInfo,
} from '@/types'

import { WebSocketDatafeed } from './WebSocketDatafeed'

export interface CryptoSymbolInfo extends SymbolInfo {
  exchange: string
  venueSymbol?: string
  instId?: string
  productType?: string
}

const DEFAULT_CRYPTO_SYMBOLS: CryptoSymbolInfo[] = [
  {
    ticker: 'BINANCE:BTCUSDT',
    name: 'Bitcoin Perpetual / USDT',
    shortName: 'BTC PERP',
    exchange: 'BINANCE',
    market: 'crypto',
    pricePrecision: 2,
    volumePrecision: 6,
    priceCurrency: 'USDT',
    type: 'crypto',
    venueSymbol: 'BTCUSDT',
  },
  {
    ticker: 'BINANCE:ETHUSDT',
    name: 'Ethereum Perpetual / USDT',
    shortName: 'ETH PERP',
    exchange: 'BINANCE',
    market: 'crypto',
    pricePrecision: 2,
    volumePrecision: 4,
    priceCurrency: 'USDT',
    type: 'crypto',
    venueSymbol: 'ETHUSDT',
  },
  {
    ticker: 'BINANCE:SOLUSDT',
    name: 'Solana Perpetual / USDT',
    shortName: 'SOL PERP',
    exchange: 'BINANCE',
    market: 'crypto',
    pricePrecision: 3,
    volumePrecision: 2,
    priceCurrency: 'USDT',
    type: 'crypto',
    venueSymbol: 'SOLUSDT',
  },

  {
    ticker: 'BITGET:BTCUSDT',
    name: 'Bitcoin USDT Futures',
    shortName: 'BTC PERP',
    exchange: 'BITGET',
    market: 'crypto',
    pricePrecision: 2,
    volumePrecision: 6,
    priceCurrency: 'USDT',
    type: 'crypto',
    venueSymbol: 'BTCUSDT',
    productType: 'USDT-FUTURES',
  },
  {
    ticker: 'BITGET:ETHUSDT',
    name: 'Ethereum USDT Futures',
    shortName: 'ETH PERP',
    exchange: 'BITGET',
    market: 'crypto',
    pricePrecision: 2,
    volumePrecision: 4,
    priceCurrency: 'USDT',
    type: 'crypto',
    venueSymbol: 'ETHUSDT',
    productType: 'USDT-FUTURES',
  },

  {
    ticker: 'OKX:BTC-USDT-SWAP',
    name: 'Bitcoin USDT Swap',
    shortName: 'BTC SWAP',
    exchange: 'OKX',
    market: 'crypto',
    pricePrecision: 2,
    volumePrecision: 6,
    priceCurrency: 'USDT',
    type: 'crypto',
    instId: 'BTC-USDT-SWAP',
  },
  {
    ticker: 'OKX:ETH-USDT-SWAP',
    name: 'Ethereum USDT Swap',
    shortName: 'ETH SWAP',
    exchange: 'OKX',
    market: 'crypto',
    pricePrecision: 2,
    volumePrecision: 4,
    priceCurrency: 'USDT',
    type: 'crypto',
    instId: 'ETH-USDT-SWAP',
  },
]

export const STANDARD_CRYPTO_SYMBOLS: readonly SymbolInfo[] = DEFAULT_CRYPTO_SYMBOLS

export type DatafeedErrorType =
  | 'history-empty'
  | 'history-request-failed'
  | 'unsupported-period'
  | 'unsupported-symbol'
  | 'subscription-failed'

export interface DatafeedErrorDetail {
  exchange?: string
  ticker: string
  period: string
  type: DatafeedErrorType
  message: string
}

export const DATAFEED_ERROR_EVENT = 'astroneum:datafeed-error'

const BINANCE_WS_BASE_URL = 'wss://fstream.binance.com/market/ws'
const BINANCE_REST_BASE_URL = 'https://fapi.binance.com/fapi/v1'
const BITGET_WS_BASE_URL = 'wss://ws.bitget.com/v2/ws/public'
const BITGET_REST_BASE_URL = 'https://api.bitget.com/api/v2/mix/market'
const OKX_WS_BASE_URL = 'wss://ws.okx.com:8443/ws/v5/public'
const OKX_REST_BASE_URL = 'https://www.okx.com/api/v5/market'

const MIN_WARMUP_BARS = 120

function tickKey(symbol: SymbolInfo, period: Period): string {
  return `${symbol.ticker}::${period.text}`
}

function matchesSearch(search: string, symbol: SymbolInfo): boolean {
  if (!search) return true
  const query = search.toLowerCase()
  return symbol.ticker.toLowerCase().includes(query) || (symbol.name ?? '').toLowerCase().includes(query)
}

function parseJson(data: MessageEvent['data']): unknown {
  if (typeof data !== 'string') return null
  try {
    return JSON.parse(data)
  } catch {
    return null
  }
}

function toNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function sortBarsAsc(bars: CandleData[]): CandleData[] {
  return bars.slice().sort((a, b) => a.timestamp - b.timestamp)
}

function filterBarsRange(bars: CandleData[], from: number, to: number): CandleData[] {
  return bars.filter(bar => bar.timestamp >= from && bar.timestamp <= to)
}

function periodMs(period: Period): number {
  const map: Record<string, number> = {
    second: 1_000,
    minute: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
    week: 604_800_000,
    month: 2_592_000_000,
    year: 31_536_000_000,
  }
  return (map[period.timespan] ?? 60_000) * period.multiplier
}

function alignRange(period: Period, from: number, to: number): { from: number; to: number } {
  const step = periodMs(period)
  const alignedFrom = Math.floor(from / step) * step
  const alignedTo = Math.floor(to / step) * step
  return alignedTo >= alignedFrom
    ? { from: alignedFrom, to: alignedTo }
    : { from: alignedFrom, to: alignedFrom }
}

function toBinanceInterval(period: Period): string | null {
  if (period.timespan === 'minute' && [1, 3, 5, 15, 30].includes(period.multiplier)) return `${period.multiplier}m`
  if (period.timespan === 'hour' && [1, 2, 4, 6, 8, 12].includes(period.multiplier)) return `${period.multiplier}h`
  if (period.timespan === 'day' && [1, 3].includes(period.multiplier)) return `${period.multiplier}d`
  if (period.timespan === 'week' && period.multiplier === 1) return '1w'
  if (period.timespan === 'month' && period.multiplier === 1) return '1M'
  return null
}

function toBitgetInterval(period: Period): string | null {
  if (period.timespan === 'minute' && [1, 3, 5, 15, 30].includes(period.multiplier)) return `${period.multiplier}m`
  if (period.timespan === 'hour' && [1, 2, 4, 6, 12].includes(period.multiplier)) return `${period.multiplier}H`
  if (period.timespan === 'day' && [1, 3].includes(period.multiplier)) return `${period.multiplier}D`
  if (period.timespan === 'week' && period.multiplier === 1) return '1W'
  if (period.timespan === 'month' && period.multiplier === 1) return '1M'
  return null
}

function toOkxInterval(period: Period): string | null {
  if (period.timespan === 'minute' && [1, 3, 5, 15, 30].includes(period.multiplier)) return `${period.multiplier}m`
  if (period.timespan === 'hour' && [1, 2, 4, 6, 12].includes(period.multiplier)) return `${period.multiplier}H`
  if (period.timespan === 'day' && [1, 3].includes(period.multiplier)) return `${period.multiplier}D`
  if (period.timespan === 'week' && period.multiplier === 1) return '1W'
  if (period.timespan === 'month' && period.multiplier === 1) return '1M'
  return null
}

function extractTickerCode(ticker: string): string {
  const idx = ticker.indexOf(':')
  return idx >= 0 ? ticker.slice(idx + 1) : ticker
}

function symbolVenueCode(symbol: SymbolInfo): string {
  const candidate = (symbol as CryptoSymbolInfo).venueSymbol ?? extractTickerCode(symbol.ticker)
  return candidate.toUpperCase()
}

function symbolInstId(symbol: SymbolInfo): string {
  return (symbol as CryptoSymbolInfo).instId ?? extractTickerCode(symbol.ticker)
}

function symbolProductTypeWs(symbol: SymbolInfo): string {
  return ((symbol as CryptoSymbolInfo).productType ?? 'USDT-FUTURES').toUpperCase()
}

function symbolProductTypeRest(symbol: SymbolInfo): string {
  return ((symbol as CryptoSymbolInfo).productType ?? 'USDT-FUTURES').toLowerCase()
}

function resolveSymbolExchange(symbol: SymbolInfo): string | null {
  if (typeof symbol.exchange === 'string' && symbol.exchange.trim()) {
    return symbol.exchange.toUpperCase()
  }
  const prefix = symbol.ticker.split(':', 1)[0]?.toUpperCase()
  return prefix && prefix.length > 0 ? prefix : null
}

function normalizeSymbol(symbol: SymbolInfo, exchange: string): SymbolInfo {
  return { ...symbol, exchange }
}

async function fetchJson(url: string): Promise<unknown> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

const _lastErrorAt = new Map<string, number>()

function unwrapStreamPayload(payload: unknown): unknown {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data?: unknown }).data ?? payload
  }
  return payload
}

function emitDatafeedError(
  symbol: SymbolInfo,
  period: Period,
  type: DatafeedErrorType,
  message: string
): void {
  const key = `${symbol.ticker}::${period.text}::${type}`
  const now = Date.now()
  const previous = _lastErrorAt.get(key) ?? 0
  if (now - previous < 2_500) return
  _lastErrorAt.set(key, now)

  const detail: DatafeedErrorDetail = {
    exchange: resolveSymbolExchange(symbol) ?? undefined,
    ticker: symbol.ticker,
    period: period.text,
    type,
    message,
  }

  console.error(`[astroneum:datafeed] ${detail.ticker} ${detail.period} - ${detail.message}`)

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<DatafeedErrorDetail>(DATAFEED_ERROR_EVENT, { detail }))
  }
}

function parseBinanceRows(payload: unknown): CandleData[] {
  if (!Array.isArray(payload)) return []
  const bars: CandleData[] = []
  for (const row of payload) {
    if (!Array.isArray(row)) continue
    const timestamp = toNumber(row[0])
    const open = toNumber(row[1])
    const high = toNumber(row[2])
    const low = toNumber(row[3])
    const close = toNumber(row[4])
    const volume = toNumber(row[5])
    const turnover = toNumber(row[7])
    if (timestamp === null || open === null || high === null || low === null || close === null || volume === null) continue
    bars.push({
      timestamp,
      open,
      high,
      low,
      close,
      volume,
      turnover: turnover ?? volume * close,
    })
  }
  return sortBarsAsc(bars)
}

function parseBitgetRows(payload: unknown): CandleData[] {
  if (!Array.isArray(payload)) return []
  const bars: CandleData[] = []
  for (const row of payload) {
    if (!Array.isArray(row)) continue
    const timestamp = toNumber(row[0])
    const open = toNumber(row[1])
    const high = toNumber(row[2])
    const low = toNumber(row[3])
    const close = toNumber(row[4])
    const volume = toNumber(row[5])
    const quoteVolume = toNumber(row[6])
    const usdtVolume = toNumber(row[7])
    if (timestamp === null || open === null || high === null || low === null || close === null || volume === null) continue
    bars.push({
      timestamp,
      open,
      high,
      low,
      close,
      volume,
      turnover: usdtVolume ?? quoteVolume ?? volume * close,
    })
  }
  return sortBarsAsc(bars)
}

function parseOkxRows(payload: unknown): CandleData[] {
  if (!Array.isArray(payload)) return []
  const bars: CandleData[] = []
  for (const row of payload) {
    if (!Array.isArray(row)) continue
    const timestamp = toNumber(row[0])
    const open = toNumber(row[1])
    const high = toNumber(row[2])
    const low = toNumber(row[3])
    const close = toNumber(row[4])
    const volume = toNumber(row[5])
    const quoteVolume = toNumber(row[7]) ?? toNumber(row[6])
    if (timestamp === null || open === null || high === null || low === null || close === null || volume === null) continue
    bars.push({
      timestamp,
      open,
      high,
      low,
      close,
      volume,
      turnover: quoteVolume ?? volume * close,
    })
  }
  return sortBarsAsc(bars)
}

export interface ExchangeAdapter {
  readonly id: string
  getHistoryBars(symbol: SymbolInfo, period: Period, from: number, to: number): Promise<CandleData[]>
  getWebSocketUrl(symbol: SymbolInfo, period: Period): string
  parseMessage(event: MessageEvent, symbol: SymbolInfo, period: Period): CandleData | null
  onOpen?(ws: WebSocket, symbol: SymbolInfo, period: Period): void
}

export const BinanceAdapter: ExchangeAdapter = {
  id: 'BINANCE',

  async getHistoryBars(symbol, period, from, to) {
    const interval = toBinanceInterval(period)
    if (interval === null) {
      emitDatafeedError(symbol, period, 'unsupported-period', `Binance does not support period ${period.text}`)
      return []
    }

    const range = alignRange(period, from, to)
    const symbolCode = symbolVenueCode(symbol)

    const primaryUrl = new URL(`${BINANCE_REST_BASE_URL}/klines`)
    primaryUrl.searchParams.set('symbol', symbolCode)
    primaryUrl.searchParams.set('interval', interval)
    primaryUrl.searchParams.set('startTime', `${range.from}`)
    primaryUrl.searchParams.set('endTime', `${range.to}`)
    primaryUrl.searchParams.set('limit', '1000')

    const fallbackUrl = new URL(`${BINANCE_REST_BASE_URL}/klines`)
    fallbackUrl.searchParams.set('symbol', symbolCode)
    fallbackUrl.searchParams.set('interval', interval)
    fallbackUrl.searchParams.set('endTime', `${range.to}`)
    fallbackUrl.searchParams.set('limit', '1000')

    const primaryPayload = await fetchJson(primaryUrl.toString())
    if (primaryPayload === null) {
      emitDatafeedError(symbol, period, 'history-request-failed', 'Binance history request failed')
    }
    const primary = parseBinanceRows(primaryPayload)
    let bars = filterBarsRange(primary, range.from, range.to)

    if (bars.length < MIN_WARMUP_BARS) {
      const fallbackPayload = await fetchJson(fallbackUrl.toString())
      const fallback = parseBinanceRows(fallbackPayload)
      const fallbackWithWarmup = fallback.filter(bar => bar.timestamp <= range.to)
      if (fallbackWithWarmup.length > bars.length) bars = fallbackWithWarmup
    }

    if (bars.length === 0) {
      emitDatafeedError(symbol, period, 'history-empty', 'Binance returned no candle data for this range')
    }

    return bars
  },

  getWebSocketUrl(symbol, period) {
    const interval = toBinanceInterval(period)
    if (interval === null) return 'wss://invalid'
    return `${BINANCE_WS_BASE_URL}/${symbolVenueCode(symbol).toLowerCase()}@kline_${interval}`
  },

  parseMessage(event) {
    const payload = unwrapStreamPayload(parseJson(event.data))
    if (!payload || typeof payload !== 'object') return null
    const data = payload as {
      e?: unknown
      k?: {
        t?: unknown
        o?: unknown
        h?: unknown
        l?: unknown
        c?: unknown
        v?: unknown
        q?: unknown
      }
    }
    if (data.e !== 'kline' || !data.k) return null

    const timestamp = toNumber(data.k.t)
    const open = toNumber(data.k.o)
    const high = toNumber(data.k.h)
    const low = toNumber(data.k.l)
    const close = toNumber(data.k.c)
    const volume = toNumber(data.k.v)
    const turnover = toNumber(data.k.q)
    if (timestamp === null || open === null || high === null || low === null || close === null || volume === null) return null

    return {
      timestamp,
      open,
      high,
      low,
      close,
      volume,
      turnover: turnover ?? volume * close,
    }
  },
}

export const BitgetAdapter: ExchangeAdapter = {
  id: 'BITGET',

  async getHistoryBars(symbol, period, from, to) {
    const granularity = toBitgetInterval(period)
    if (granularity === null) {
      emitDatafeedError(symbol, period, 'unsupported-period', `Bitget does not support period ${period.text}`)
      return []
    }

    const range = alignRange(period, from, to)
    const symbolCode = symbolVenueCode(symbol)
    const productTypeRest = symbolProductTypeRest(symbol)

    const primaryUrl = new URL(`${BITGET_REST_BASE_URL}/candles`)
    primaryUrl.searchParams.set('symbol', symbolCode)
    primaryUrl.searchParams.set('productType', productTypeRest)
    primaryUrl.searchParams.set('granularity', granularity)
    primaryUrl.searchParams.set('startTime', `${range.from}`)
    primaryUrl.searchParams.set('endTime', `${range.to}`)
    primaryUrl.searchParams.set('limit', '1000')

    const fallbackUrl = new URL(`${BITGET_REST_BASE_URL}/candles`)
    fallbackUrl.searchParams.set('symbol', symbolCode)
    fallbackUrl.searchParams.set('productType', productTypeRest)
    fallbackUrl.searchParams.set('granularity', granularity)
    fallbackUrl.searchParams.set('limit', '1000')

    const primaryPayload = await fetchJson(primaryUrl.toString())
    if (primaryPayload === null) {
      emitDatafeedError(symbol, period, 'history-request-failed', 'Bitget history request failed')
    }
    const primary = parseBitgetRows((primaryPayload as { data?: unknown } | null)?.data)
    let bars = filterBarsRange(primary, range.from, range.to)

    if (bars.length < MIN_WARMUP_BARS) {
      const fallbackPayload = await fetchJson(fallbackUrl.toString())
      const fallback = parseBitgetRows((fallbackPayload as { data?: unknown } | null)?.data)
      const fallbackWithWarmup = fallback.filter(bar => bar.timestamp <= range.to)
      if (fallbackWithWarmup.length > bars.length) bars = fallbackWithWarmup
    }

    if (bars.length === 0) {
      emitDatafeedError(symbol, period, 'history-empty', 'Bitget returned no candle data for this range')
    }

    return bars
  },

  getWebSocketUrl() {
    return BITGET_WS_BASE_URL
  },

  onOpen(ws, symbol, period) {
    const granularity = toBitgetInterval(period)
    if (granularity === null) {
      emitDatafeedError(symbol, period, 'unsupported-period', `Bitget does not support period ${period.text}`)
      return
    }
    const productTypeWs = symbolProductTypeWs(symbol)

    ws.send(JSON.stringify({
      op: 'subscribe',
      args: [{
        instType: productTypeWs,
        channel: `candle${granularity}`,
        instId: symbolVenueCode(symbol),
      }],
    }))
  },

  parseMessage(event) {
    const payload = parseJson(event.data)
    if (!payload || typeof payload !== 'object') return null
    const dataRows = (payload as { data?: unknown }).data
    if (!Array.isArray(dataRows)) return null
    const parsed = parseBitgetRows(dataRows)
    return parsed.length > 0 ? parsed[parsed.length - 1] : null
  },
}

export const OkxAdapter: ExchangeAdapter = {
  id: 'OKX',

  async getHistoryBars(symbol, period, from, to) {
    const bar = toOkxInterval(period)
    if (bar === null) {
      emitDatafeedError(symbol, period, 'unsupported-period', `OKX does not support period ${period.text}`)
      return []
    }

    const range = alignRange(period, from, to)
    const instId = symbolInstId(symbol)

    const primaryUrl = new URL(`${OKX_REST_BASE_URL}/candles`)
    primaryUrl.searchParams.set('instId', instId)
    primaryUrl.searchParams.set('bar', bar)
    primaryUrl.searchParams.set('limit', '300')

    const fallbackUrl = new URL(`${OKX_REST_BASE_URL}/history-candles`)
    fallbackUrl.searchParams.set('instId', instId)
    fallbackUrl.searchParams.set('bar', bar)
    fallbackUrl.searchParams.set('limit', '300')

    const primaryPayload = await fetchJson(primaryUrl.toString())
    if (primaryPayload === null) {
      emitDatafeedError(symbol, period, 'history-request-failed', 'OKX history request failed')
    }
    const primary = parseOkxRows((primaryPayload as { data?: unknown } | null)?.data)
    let bars = filterBarsRange(primary, range.from, range.to)

    if (bars.length < MIN_WARMUP_BARS) {
      const primaryWithWarmup = primary.filter(barItem => barItem.timestamp <= range.to)
      if (primaryWithWarmup.length > bars.length) {
        bars = primaryWithWarmup
      } else {
        const fallbackPayload = await fetchJson(fallbackUrl.toString())
        const fallback = parseOkxRows((fallbackPayload as { data?: unknown } | null)?.data)
        const fallbackWithWarmup = fallback.filter(barItem => barItem.timestamp <= range.to)
        if (fallbackWithWarmup.length > bars.length) bars = fallbackWithWarmup
      }
    }

    if (bars.length === 0) {
      emitDatafeedError(symbol, period, 'history-empty', 'OKX returned no candle data for this range')
    }

    return bars
  },

  getWebSocketUrl() {
    return OKX_WS_BASE_URL
  },

  onOpen(ws, symbol, period) {
    const bar = toOkxInterval(period)
    if (bar === null) {
      emitDatafeedError(symbol, period, 'unsupported-period', `OKX does not support period ${period.text}`)
      return
    }

    ws.send(JSON.stringify({
      op: 'subscribe',
      args: [{
        channel: `candle${bar}`,
        instId: symbolInstId(symbol),
      }],
    }))
  },

  parseMessage(event) {
    const payload = parseJson(event.data)
    if (!payload || typeof payload !== 'object') return null
    const dataRows = (payload as { data?: unknown }).data
    if (!Array.isArray(dataRows)) return null
    const parsed = parseOkxRows(dataRows)
    return parsed.length > 0 ? parsed[parsed.length - 1] : null
  },
}

const DEFAULT_ADAPTERS: readonly ExchangeAdapter[] = [
  BinanceAdapter,
  BitgetAdapter,
  OkxAdapter,
]

class ExchangeAdapterDatafeed extends WebSocketDatafeed {
  private readonly adapter: ExchangeAdapter

  constructor(adapter: ExchangeAdapter, smoothingDuration: number) {
    super({ smoothingDuration })
    this.adapter = adapter
  }

  async getHistoryBars(symbol: SymbolInfo, period: Period, from: number, to: number): Promise<CandleData[]> {
    return this.adapter.getHistoryBars(symbol, period, from, to)
  }

  override subscribe(symbol: SymbolInfo, period: Period, callback: DatafeedSubscribeCallback): void {
    const url = this.adapter.getWebSocketUrl(symbol, period)
    if (!url || url === 'wss://invalid') {
      emitDatafeedError(symbol, period, 'subscription-failed', `No WebSocket stream available for period ${period.text}`)
      return
    }
    super.subscribe(symbol, period, callback)
  }

  override getWebSocketUrl(symbol: SymbolInfo, period: Period): string {
    return this.adapter.getWebSocketUrl(symbol, period)
  }

  override parseMessage(event: MessageEvent, symbol: SymbolInfo, period: Period): CandleData | null {
    return this.adapter.parseMessage(event, symbol, period)
  }

  override onOpen(ws: WebSocket, symbol: SymbolInfo, period: Period): void {
    this.adapter.onOpen?.(ws, symbol, period)
  }
}

class NoDataDatafeed implements Datafeed {
  searchSymbols(search = ''): Promise<SymbolInfo[]> {
    void search
    return Promise.resolve([])
  }

  getHistoryData(symbol: SymbolInfo, period: Period, from: number, to: number): Promise<CandleData[]> {
    void from
    void to
    emitDatafeedError(symbol, period, 'unsupported-symbol', `Unsupported symbol ${symbol.ticker}`)
    return Promise.resolve([])
  }

  subscribe(symbol: SymbolInfo, period: Period, callback: DatafeedSubscribeCallback): void {
    void callback
    emitDatafeedError(symbol, period, 'subscription-failed', `No live feed available for ${symbol.ticker}`)
  }

  unsubscribe(symbol: SymbolInfo, period: Period): void {
    void symbol
    void period
  }
}

export interface StandardCryptoDatafeedOptions {
  /**
   * Symbols available through searchSymbols.
   * Defaults to STANDARD_CRYPTO_SYMBOLS.
   */
  symbols?: readonly SymbolInfo[]
  /**
   * Exchange adapters keyed by adapter.id.
   * Defaults to built-in Binance, Bitget, and OKX adapters.
   */
  adapters?: readonly ExchangeAdapter[]
  /**
   * Tick interpolation duration (ms) for smoother live movement.
   * Set to 0 for raw, non-interpolated tick rendering.
   * Defaults to 220.
   */
  smoothingDuration?: number
}

export class StandardCryptoDatafeed implements Datafeed {
  private readonly symbols: readonly SymbolInfo[]
  private readonly liveFeeds = new Map<string, ExchangeAdapterDatafeed>()
  private readonly supportedExchanges = new Set<string>()
  private readonly noDataFeed = new NoDataDatafeed()
  private readonly activeFeedByKey = new Map<string, Datafeed>()

  constructor(options: StandardCryptoDatafeedOptions = {}) {
    this.symbols = options.symbols ?? STANDARD_CRYPTO_SYMBOLS
    const smoothingDuration = Math.max(0, options.smoothingDuration ?? 220)

    const adapters = options.adapters && options.adapters.length > 0
      ? options.adapters
      : DEFAULT_ADAPTERS

    for (const adapter of adapters) {
      const id = adapter.id.toUpperCase()
      this.supportedExchanges.add(id)
      this.liveFeeds.set(id, new ExchangeAdapterDatafeed({ ...adapter, id }, smoothingDuration))
    }
  }

  searchSymbols(search = ''): Promise<SymbolInfo[]> {
    return Promise.resolve(this.symbols.filter(symbol => matchesSearch(search, symbol)))
  }

  async getHistoryData(symbol: SymbolInfo, period: Period, from: number, to: number): Promise<CandleData[]> {
    const feed = this.resolveFeed(symbol)
    return feed.getHistoryData(symbol, period, from, to)
  }

  subscribe(symbol: SymbolInfo, period: Period, callback: DatafeedSubscribeCallback): void {
    const key = tickKey(symbol, period)
    this.unsubscribe(symbol, period)

    const feed = this.resolveFeed(symbol)
    this.activeFeedByKey.set(key, feed)
    feed.subscribe(this.normalizeSymbol(symbol), period, callback)
  }

  unsubscribe(symbol: SymbolInfo, period: Period): void {
    const key = tickKey(symbol, period)
    const feed = this.activeFeedByKey.get(key) ?? this.resolveFeed(symbol)
    feed.unsubscribe(this.normalizeSymbol(symbol), period)
    this.activeFeedByKey.delete(key)
  }

  private normalizeSymbol(symbol: SymbolInfo): SymbolInfo {
    const exchange = this.resolveExchange(symbol)
    return exchange ? normalizeSymbol(symbol, exchange) : symbol
  }

  private resolveFeed(symbol: SymbolInfo): Datafeed {
    const exchange = this.resolveExchange(symbol)
    if (exchange !== null) {
      const feed = this.liveFeeds.get(exchange)
      if (feed) return feed
    }
    return this.noDataFeed
  }

  private resolveExchange(symbol: SymbolInfo): string | null {
    const exchange = resolveSymbolExchange(symbol)
    if (!exchange) return null
    return this.supportedExchanges.has(exchange) ? exchange : null
  }
}

export function createStandardCryptoDatafeed(options: StandardCryptoDatafeedOptions = {}): StandardCryptoDatafeed {
  return new StandardCryptoDatafeed(options)
}
