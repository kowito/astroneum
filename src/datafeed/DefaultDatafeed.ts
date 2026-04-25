import { type Datafeed, type SymbolInfo, type Period, type DatafeedSubscribeCallback, type CandleData } from '@/types'
import { asPrice, asVolume, asTimestamp, rafMergeTick } from '@/utils'
import { TickAnimator } from '@/engine/common/TickAnimator'

// ---------------------------------------------------------------------------
// Polygon.io REST response shapes
// ---------------------------------------------------------------------------
interface PolygonTickerResult {
  ticker: string
  name: string
  market: string
  primary_exchange: string
  currency_name: string
  type: string
}

interface PolygonTickersResponse {
  status: string
  results?: PolygonTickerResult[]
}

interface PolygonAggBar {
  t: number  // open timestamp (ms)
  o: number  // open
  h: number  // high
  l: number  // low
  c: number  // close
  v: number  // volume
  vw: number // volume-weighted avg price (turnover)
}

interface PolygonAggsResponse {
  status: string
  results?: PolygonAggBar[]
}

// ---------------------------------------------------------------------------
// Polygon.io WebSocket message shapes
// ---------------------------------------------------------------------------
interface PolygonWSStatusMsg {
  ev: 'status'
  status: 'auth_success' | 'auth_failed' | 'connected' | 'success'
  message: string
}

interface PolygonWSTradeBar {
  ev: 'T'
  sym: string
  s: number  // bar start timestamp (ms)
  o: number
  h: number
  l: number
  c: number
  v: number
  vw: number
}

type PolygonWSMessage = PolygonWSStatusMsg | PolygonWSTradeBar

function isStatusMsg(msg: PolygonWSMessage): msg is PolygonWSStatusMsg {
  return msg.ev === 'status'
}

export default class DefaultDatafeed implements Datafeed {
  constructor(apiKey: string) {
    this._apiKey = apiKey
  }

  private readonly _apiKey: string
  private _prevSymbolMarket?: string
  private _ws?: WebSocket
  private _reconnectDelay = 1_000
  private _reconnectTimer?: ReturnType<typeof setTimeout>
  private _currentSymbol?: SymbolInfo
  private _currentCallback?: DatafeedSubscribeCallback

  /**
   * OHLCV-aware coalescer: merges ticks arriving within the same rAF frame
   * into one financially accurate bar (high=max, low=min, close=last, volume=sum).
   * Feeds the merged result into the TickAnimator for smooth close interpolation.
   */
  private readonly _mergeTick = rafMergeTick((merged: CandleData): void => {
    this._animator.feed(merged)
  })

  /**
   * Smooth price interpolation: animates the last bar's close/high/low values
   * over 120ms so rapid ticks produce fluid motion instead of jarring jumps.
   * The interpolated frame is what actually reaches the chart callback.
   */
  private readonly _animator = new TickAnimator((frame: CandleData): void => {
    this._currentCallback?.(frame)
  })

  async searchSymbols(search?: string): Promise<SymbolInfo[]> {
    const url = new URL('https://api.polygon.io/v3/reference/tickers')
    url.searchParams.set('apiKey', this._apiKey)
    url.searchParams.set('active', 'true')
    url.searchParams.set('search', search ?? '')

    const response = await fetch(url.toString())
    if (!response.ok) throw new Error(`[DefaultDatafeed] searchSymbols failed: ${response.status}`)
    const result: PolygonTickersResponse = await response.json() as PolygonTickersResponse

    return (result.results ?? []).map((data): SymbolInfo => ({
      ticker: data.ticker,
      name: data.name,
      shortName: data.ticker,
      market: data.market,
      exchange: data.primary_exchange,
      priceCurrency: data.currency_name,
      type: data.type
    }))
  }

  async getHistoryData(symbol: SymbolInfo, period: Period, from: number, to: number): Promise<CandleData[]> {
    const url = new URL(
      `https://api.polygon.io/v2/aggs/ticker/${symbol.ticker}/range/${period.multiplier}/${period.timespan}/${from}/${to}`
    )
    url.searchParams.set('apiKey', this._apiKey)

    const response = await fetch(url.toString())
    if (!response.ok) throw new Error(`[DefaultDatafeed] getHistoryData failed: ${response.status}`)
    const result: PolygonAggsResponse = await response.json() as PolygonAggsResponse

    return (result.results ?? []).map((data): CandleData => ({
      timestamp: asTimestamp(data.t),
      open: asPrice(data.o),
      high: asPrice(data.h),
      low: asPrice(data.l),
      close: asPrice(data.c),
      volume: asVolume(data.v),
      turnover: asVolume(data.vw)
    }))
  }

  /**
   * Subscribes to real-time trade ticks for the given symbol.
   * NOTE: Polygon's delayed WebSocket stream delivers raw trades (ev: 'T'),
   * not pre-aggregated OHLCV bars. Bar aggregation is handled by the engine.
   * The `_period` parameter is intentionally unused.
   */
  subscribe(symbol: SymbolInfo, _period: Period, callback: DatafeedSubscribeCallback): void {
    const market = symbol.market
    if (!market) return
    this._currentSymbol = symbol
    this._currentCallback = callback
    if (this._prevSymbolMarket !== market) {
      this._teardownWS()
      this._setupWS(market)
    } else {
      this._ws?.send(JSON.stringify({ action: 'subscribe', params: `T.${symbol.ticker}` }))
    }
    this._prevSymbolMarket = market
  }

  private _setupWS(market: string): void {
    this._ws = new WebSocket(`wss://delayed.polygon.io/${market}`)

    this._ws.onopen = (): void => {
      this._reconnectDelay = 1_000
      this._ws?.send(JSON.stringify({ action: 'auth', params: this._apiKey }))
    }

    this._ws.onmessage = (event: MessageEvent<string>): void => {
      const messages = JSON.parse(event.data) as PolygonWSMessage[]
      for (const msg of messages) {
        if (isStatusMsg(msg)) {
          if (msg.status === 'auth_success' && this._currentSymbol) {
            this._ws?.send(JSON.stringify({ action: 'subscribe', params: `T.${this._currentSymbol.ticker}` }))
          }
        } else {
          this._mergeTick({
            timestamp: asTimestamp(msg.s),
            open: asPrice(msg.o),
            high: asPrice(msg.h),
            low: asPrice(msg.l),
            close: asPrice(msg.c),
            volume: asVolume(msg.v),
            turnover: asVolume(msg.vw)
          })
        }
      }
    }

    this._ws.onclose = (): void => {
      this._scheduleReconnect()
    }

    this._ws.onerror = (): void => {
      this._ws?.close()
    }
  }

  private _scheduleReconnect(): void {
    if (!this._currentSymbol || !this._prevSymbolMarket) return
    const delay = this._reconnectDelay
    this._reconnectDelay = Math.min(this._reconnectDelay * 2, 30_000)
    this._reconnectTimer = setTimeout(() => {
      this._setupWS(this._prevSymbolMarket!)
    }, delay)
  }

  private _teardownWS(): void {
    if (this._reconnectTimer !== undefined) {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = undefined
    }
    this._animator.cancel()
    this._ws?.close()
    this._ws = undefined
  }

  /**
   * Tears down the active WebSocket subscription for the given symbol.
   * The `_period` parameter is intentionally unused (matches interface contract).
   */
  unsubscribe(symbol: SymbolInfo, _period: Period): void {
    this._ws?.send(JSON.stringify({ action: 'unsubscribe', params: `T.${symbol.ticker}` }))
  }
}
