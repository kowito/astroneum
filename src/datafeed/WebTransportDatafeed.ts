/**
 * WebTransportDatafeed (experimental) — a `Datafeed` over WebTransport
 * (HTTP/3), for servers that implement the protocol below. Live bars travel on
 * ordered, reliable QUIC streams, so a lossy network delays updates instead of
 * reordering or dropping them, and one connection carries every subscription.
 *
 * Protocol v1
 * ───────────
 * Requests: the client opens a bidirectional stream, writes one UTF-8 JSON
 * line terminated by "\n", and closes its side; the server writes the
 * response and closes.
 *   {"type":"history","ticker","exchange"?,"multiplier","timespan","from","to"}
 *       → one BarsCodec frame (an empty body means no bars)
 *   {"type":"search","query"}            → UTF-8 JSON array of SymbolInfo
 *   {"type":"subscribe","id","ticker","exchange"?,"multiplier","timespan"}
 *       → empty acknowledgement
 *   {"type":"unsubscribe","id"}          → empty acknowledgement
 *
 * Live bars: for each subscription the server opens a unidirectional stream
 * that starts with the subscription id (u32, little-endian) followed by
 * BarsCodec frames, each carrying one or more updated bars. Unsubscribing
 * ends the stream. After a reconnect the client re-sends every subscription
 * with the same id.
 *
 * Use `WebTransportDatafeed.isSupported()` and fall back to another datafeed
 * where WebTransport is unavailable.
 */

import type { CandleData, Datafeed, DatafeedSubscribeCallback, Period, SymbolInfo } from '@/types'

import { BarsCodec } from './codec/BarsCodec'

// Not in TypeScript's DOM lib yet; only the surface used here.
interface WebTransportBidirectionalStream {
  readable: ReadableStream<Uint8Array>
  writable: WritableStream<Uint8Array>
}
interface WebTransportLike {
  ready: Promise<unknown>
  closed: Promise<unknown>
  incomingUnidirectionalStreams: ReadableStream<ReadableStream<Uint8Array>>
  createBidirectionalStream: () => Promise<WebTransportBidirectionalStream>
  close: (info?: { closeCode?: number, reason?: string }) => void
}
type WebTransportConstructor = new (url: string, options?: Record<string, unknown>) => WebTransportLike

export interface WebTransportDatafeedOptions {
  url: string
  /** Passed to the WebTransport constructor, e.g. `serverCertificateHashes` for local development. */
  transportOptions?: Record<string, unknown>
  /** Reconnect backoff after a dropped connection. Defaults: 500 ms doubling to 15 s. */
  reconnectDelayMs?: { initial?: number, max?: number }
}

interface Subscription {
  id: number
  symbol: SymbolInfo
  period: Period
  callback: DatafeedSubscribeCallback
  /** Bars received since the last delivery, newest version per timestamp. */
  pending: Map<number, CandleData>
  flushScheduled: boolean
}

function getConstructor (): WebTransportConstructor | undefined {
  return (globalThis as { WebTransport?: WebTransportConstructor }).WebTransport
}

function subscriptionKey (symbol: SymbolInfo, period: Period): string {
  return `${symbol.exchange ?? ''}:${symbol.ticker}|${period.multiplier}${period.timespan}`
}

function concat (chunks: Uint8Array[]): Uint8Array {
  if (chunks.length === 1) return chunks[0]
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0))
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

async function readAll (stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    if (value !== undefined && value.byteLength > 0) chunks.push(value)
  }
  return concat(chunks)
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export class WebTransportDatafeed implements Datafeed {
  private readonly _url: string
  private readonly _transportOptions: Record<string, unknown> | undefined
  private readonly _initialDelay: number
  private readonly _maxDelay: number
  private _transport: WebTransportLike | null = null
  private _connecting: Promise<WebTransportLike> | null = null
  private _reconnectDelay: number
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private _closed = false
  private _nextId = 0
  private readonly _subscriptions = new Map<string, Subscription>()
  private readonly _byId = new Map<number, Subscription>()
  // Subscribe/unsubscribe requests are sent in order.
  private _control: Promise<void> = Promise.resolve()

  constructor (urlOrOptions: string | WebTransportDatafeedOptions) {
    const options = typeof urlOrOptions === 'string' ? { url: urlOrOptions } : urlOrOptions
    this._url = options.url
    this._transportOptions = options.transportOptions
    this._initialDelay = options.reconnectDelayMs?.initial ?? 500
    this._maxDelay = options.reconnectDelayMs?.max ?? 15_000
    this._reconnectDelay = this._initialDelay
  }

  static isSupported (): boolean {
    return typeof getConstructor() === 'function'
  }

  /** Connect now instead of on the first request. */
  async connect (): Promise<void> {
    await this._connected()
  }

  async searchSymbols (search = ''): Promise<SymbolInfo[]> {
    const body = await this._request({ type: 'search', query: search })
    if (body.byteLength === 0) return []
    const parsed: unknown = JSON.parse(decoder.decode(body))
    return Array.isArray(parsed) ? parsed as SymbolInfo[] : []
  }

  async getHistoryData (symbol: SymbolInfo, period: Period, from: number, to: number): Promise<CandleData[]> {
    const body = await this._request({
      type: 'history',
      ticker: symbol.ticker,
      exchange: symbol.exchange,
      multiplier: period.multiplier,
      timespan: period.timespan,
      from,
      to
    })
    if (body.byteLength === 0) return []
    const bars = BarsCodec.decode(body)
    if (bars.length === 0) throw new Error('[WebTransportDatafeed] the server sent an invalid history frame')
    return bars
  }

  subscribe (symbol: SymbolInfo, period: Period, callback: DatafeedSubscribeCallback): void {
    const key = subscriptionKey(symbol, period)
    const existing = this._subscriptions.get(key)
    if (existing !== undefined) {
      existing.callback = callback
      return
    }
    const sub: Subscription = { id: ++this._nextId, symbol, period, callback, pending: new Map(), flushScheduled: false }
    this._subscriptions.set(key, sub)
    this._byId.set(sub.id, sub)
    this._sendControl(() => this._subscribeMessage(sub))
  }

  unsubscribe (symbol: SymbolInfo, period: Period): void {
    const key = subscriptionKey(symbol, period)
    const sub = this._subscriptions.get(key)
    if (sub === undefined) return
    this._subscriptions.delete(key)
    this._byId.delete(sub.id)
    if (this._transport !== null) this._sendControl(() => ({ type: 'unsubscribe', id: sub.id }))
  }

  /** Close the connection and drop every subscription. */
  close (): void {
    this._closed = true
    if (this._reconnectTimer !== null) clearTimeout(this._reconnectTimer)
    this._subscriptions.clear()
    this._byId.clear()
    const transport = this._transport
    this._transport = null
    this._connecting = null
    try {
      transport?.close()
    } catch {
      // already closed
    }
  }

  private _subscribeMessage (sub: Subscription): Record<string, unknown> {
    return {
      type: 'subscribe',
      id: sub.id,
      ticker: sub.symbol.ticker,
      exchange: sub.symbol.exchange,
      multiplier: sub.period.multiplier,
      timespan: sub.period.timespan
    }
  }

  private _sendControl (message: () => Record<string, unknown>): void {
    this._control = this._control
      .then(async () => { await this._request(message()) })
      // A failed request is retried by the re-subscribe that follows a reconnect.
      .catch(() => undefined)
  }

  private async _connected (): Promise<WebTransportLike> {
    if (this._closed) throw new Error('[WebTransportDatafeed] closed')
    if (this._transport !== null) return this._transport
    this._connecting ??= this._open().finally(() => { this._connecting = null })
    return await this._connecting
  }

  private async _open (): Promise<WebTransportLike> {
    const WebTransport = getConstructor()
    if (WebTransport === undefined) {
      throw new Error('[WebTransportDatafeed] WebTransport is not available in this browser')
    }
    const transport = new WebTransport(this._url, this._transportOptions)
    await transport.ready
    this._transport = transport
    this._reconnectDelay = this._initialDelay
    void this._acceptStreams(transport)
    transport.closed.then(
      () => { this._onDisconnect(transport) },
      () => { this._onDisconnect(transport) }
    )
    return transport
  }

  private async _request (message: Record<string, unknown>): Promise<Uint8Array> {
    const transport = await this._connected()
    const stream = await transport.createBidirectionalStream()
    const writer = stream.writable.getWriter()
    await writer.write(encoder.encode(JSON.stringify(message) + '\n'))
    await writer.close()
    return await readAll(stream.readable)
  }

  private async _acceptStreams (transport: WebTransportLike): Promise<void> {
    const reader = transport.incomingUnidirectionalStreams.getReader()
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) return
        if (value !== undefined) void this._readSubscriptionStream(value)
      }
    } catch {
      // connection closed
    }
  }

  private async _readSubscriptionStream (stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader()
    let buffer: Uint8Array = new Uint8Array(0)
    let subId: number | null = null
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) return
        if (value === undefined || value.byteLength === 0) continue
        buffer = concat([buffer, value])
        if (subId === null) {
          if (buffer.byteLength < 4) continue
          subId = new DataView(buffer.buffer, buffer.byteOffset, 4).getUint32(0, true)
          buffer = buffer.subarray(4)
        }
        for (;;) {
          const length = BarsCodec.frameLength(buffer)
          if (length === null) {
            if (buffer.byteLength >= BarsCodec.HEADER_SIZE) return // not a BarsCodec stream: stop reading it
            break
          }
          if (buffer.byteLength < length) break
          this._receive(subId, BarsCodec.decode(buffer.subarray(0, length)))
          buffer = buffer.subarray(length)
        }
      }
    } catch {
      // stream reset by the server or the connection
    }
  }

  private _receive (subId: number, bars: CandleData[]): void {
    const sub = this._byId.get(subId)
    if (sub === undefined || bars.length === 0) return
    bars.forEach(bar => sub.pending.set(bar.timestamp, bar))
    if (sub.flushScheduled) return
    sub.flushScheduled = true
    // Deliver at most once per frame; a burst (or a background tab) keeps only
    // the newest version of each bar.
    const flush = (): void => {
      sub.flushScheduled = false
      if (this._byId.get(sub.id) !== sub) return
      const due = [...sub.pending.values()].sort((a, b) => a.timestamp - b.timestamp)
      sub.pending.clear()
      due.forEach(bar => { sub.callback(bar) })
    }
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush)
    else setTimeout(flush, 0)
  }

  private _onDisconnect (transport: WebTransportLike): void {
    if (this._transport !== transport) return
    this._transport = null
    this._scheduleReconnect()
  }

  // Requests reconnect on their own; live subscriptions need it done for them.
  private _scheduleReconnect (): void {
    if (this._closed || this._reconnectTimer !== null || this._subscriptions.size === 0) return
    const delay = this._reconnectDelay
    this._reconnectDelay = Math.min(this._reconnectDelay * 2, this._maxDelay)
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null
      this._connected().then(
        () => { this._subscriptions.forEach(sub => { this._sendControl(() => this._subscribeMessage(sub)) }) },
        () => { this._scheduleReconnect() }
      )
    }, delay)
  }
}
