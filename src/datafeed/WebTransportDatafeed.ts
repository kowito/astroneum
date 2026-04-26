/**
 * WebTransportDatafeed — P4-A
 *
 * A high-performance datafeed implementation using the WebTransport API
 * (HTTP/3 QUIC streams).  WebTransport provides:
 *   • Significantly lower latency than WebSocket on lossy networks (no HoL blocking)
 *   • Unidirectional / bidirectional QUIC streams
 *   • Datagram support for fire-and-forget tick delivery
 *
 * Server-side protocol
 * ────────────────────
 * The server must speak a custom binary protocol over unidirectional QUIC
 * streams.  Each stream carries frames delimited by a 4-byte (u32 LE) length
 * prefix followed by binary payload decoded by `BarsCodec`.
 *
 * Graceful degradation
 * ────────────────────
 * When WebTransport is unavailable (all browsers except Chrome 97+), callers
 * should fall back to `DefaultDatafeed` (WebSocket).  Use
 * `WebTransportDatafeed.isSupported()` to check at runtime.
 *
 * Usage
 * ─────
 *   const feed = new WebTransportDatafeed('https://my-server.example.com/feed')
 *   await feed.connect()
 *   // then pass to `init()` as datafeed
 */

import type { Datafeed, SymbolInfo, Period, DatafeedSubscribeCallback, CandleData } from '@/types'
import { BarsCodec } from './codec/BarsCodec'

// TypeScript does not yet ship WebTransport types in lib.dom.d.ts.
// We declare the minimum surface we use.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WebTransportType = Record<string, any>
declare const WebTransport: { new(url: string, opts?: object): WebTransportType } | undefined

export class WebTransportDatafeed implements Datafeed {
  private readonly _url: string
  private _transport: WebTransportType | null = null
  private _connected = false
  private _currentCallback: DatafeedSubscribeCallback | null = null
  private _currentSymbol: SymbolInfo | null = null

  constructor (url: string) {
    this._url = url
  }

  static isSupported (): boolean {
    return typeof WebTransport !== 'undefined'
  }

  /** Connect to the WebTransport server. Must be called before subscribe. */
  async connect (): Promise<void> {
    if (!WebTransportDatafeed.isSupported()) {
      throw new Error('[WebTransportDatafeed] WebTransport is not available in this browser.')
    }
    this._transport = new (WebTransport as { new(url: string, opts?: object): WebTransportType })(this._url, {
      congestionControl: 'throughput'
    })
    await (this._transport.ready as Promise<void>)
    this._connected = true
    void this._readDatagrams()
  }

  private async _readDatagrams (): Promise<void> {
    if (this._transport === null) return
    try {
      const reader: ReadableStreamDefaultReader<Uint8Array> =
        (this._transport.datagrams.readable as ReadableStream<Uint8Array>).getReader()
      while (true) {
        const { value, done } = await reader.read() as { value?: Uint8Array; done: boolean }
        if (done) break
        if (value === undefined) continue
        // Each datagram is a single BarsCodec frame (1 bar)
        const bars = BarsCodec.decode(value)
        if (bars.length > 0 && this._currentCallback !== null) {
          this._currentCallback(bars[bars.length - 1])
        }
      }
    } catch {
      // Connection closed or datagram stream ended
    }
  }

  searchSymbols (_search?: string): Promise<SymbolInfo[]> {
    // Symbol search is out of scope for the WebTransport datafeed.
    // Consumers should use a separate REST endpoint or DefaultDatafeed.searchSymbols().
    return Promise.resolve([])
  }

  async getHistoryData (
    symbol: SymbolInfo,
    period: Period,
    from: number,
    to: number
  ): Promise<CandleData[]> {
    if (!this._connected || this._transport === null) {
      throw new Error('[WebTransportDatafeed] Not connected. Call connect() first.')
    }

    // Open a bidirectional stream: send request, read response.
    const stream: WebTransportType = await this._transport.createBidirectionalStream()
    const writer: WritableStreamDefaultWriter<Uint8Array> = stream.writable.getWriter()
    const reader: ReadableStreamDefaultReader<Uint8Array> = stream.readable.getReader()

    // Request frame: JSON newline-delimited (simple enough for a prototype)
    const req = JSON.stringify({
      type: 'history',
      ticker: symbol.ticker,
      multiplier: period.multiplier,
      timespan: period.timespan,
      from,
      to
    })
    await writer.write(new TextEncoder().encode(req + '\n'))
    await writer.close()

    // Response: length-prefixed BarsCodec frames
    const chunks: Uint8Array[] = []
    while (true) {
      const { value, done } = await reader.read() as { value?: Uint8Array; done: boolean }
      if (done) break
      if (value !== undefined) chunks.push(value)
    }

    if (chunks.length === 0) return []

    // Concat chunks into a single buffer
    const totalLen = chunks.reduce((s, c) => s + c.length, 0)
    const combined = new Uint8Array(totalLen)
    let offset = 0
    for (const chunk of chunks) {
      combined.set(chunk, offset)
      offset += chunk.length
    }

    return BarsCodec.decode(combined)
  }

  subscribe (symbol: SymbolInfo, _period: Period, callback: DatafeedSubscribeCallback): void {
    this._currentSymbol = symbol
    this._currentCallback = callback
  }

  unsubscribe (_symbol: SymbolInfo, _period: Period): void {
    this._currentCallback = null
    this._currentSymbol = null
  }

  async close (): Promise<void> {
    if (this._transport !== null) {
      try { await this._transport.close() } catch { /* ignore */ }
      this._transport = null
    }
    this._connected = false
  }
}
