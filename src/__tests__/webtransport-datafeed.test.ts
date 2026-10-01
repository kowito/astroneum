import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { BarsCodec } from '../datafeed/codec/BarsCodec'
import { WebTransportDatafeed } from '../datafeed/WebTransportDatafeed'
import type { CandleData, Period, SymbolInfo } from '../types'

const MIN = 60_000
const PERIOD: Period = { multiplier: 1, timespan: 'minute', text: '1m' }
const BTC: SymbolInfo = { ticker: 'BTCUSDT', exchange: 'BINANCE' }
const ETH: SymbolInfo = { ticker: 'ETHUSDT', exchange: 'BINANCE' }

const sleep = async (ms: number): Promise<void> => { await new Promise(resolve => setTimeout(resolve, ms)) }
const bar = (t: number, close: number): CandleData => ({ timestamp: t * MIN, open: close, high: close + 1, low: close - 1, close, volume: 5 })

function concat (chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0))
  let o = 0
  for (const c of chunks) { out.set(c, o); o += c.byteLength }
  return out
}

/** In-memory server speaking protocol v1, plus the WebTransport class it backs. */
class MockServer {
  readonly transports: MockTransport[] = []
  readonly requests: Array<Record<string, any>> = []
  history: CandleData[] = Array.from({ length: 50 }, (_, i) => bar(i, 100 + i))
  rawHistory: Uint8Array | null = null
  readonly symbols: SymbolInfo[] = [BTC, ETH]

  install (): void {
    const server = this
    ;(globalThis as any).WebTransport = class extends MockTransport {
      constructor (url: string) { super(server, url) }
    }
  }

  get current (): MockTransport { return this.transports[this.transports.length - 1] }

  handle (transport: MockTransport, req: Record<string, any>, respond: (bytes: Uint8Array) => void): void {
    this.requests.push(req)
    switch (req.type) {
      case 'history':
        respond(this.rawHistory ?? BarsCodec.encode(this.history.filter(b => b.timestamp >= req.from && b.timestamp <= req.to)))
        break
      case 'search':
        respond(new TextEncoder().encode(JSON.stringify(this.symbols.filter(s => s.ticker.includes(req.query)))))
        break
      case 'subscribe':
        transport.openSubscription(req.id)
        respond(new Uint8Array(0))
        break
      case 'unsubscribe':
        transport.subscriptions.get(req.id)?.close()
        transport.subscriptions.delete(req.id)
        respond(new Uint8Array(0))
        break
    }
  }

  /** Send bars on a subscription stream, split into small chunks to exercise reassembly. */
  push (id: number, bars: CandleData[]): void {
    const bytes = BarsCodec.encode(bars)
    const stream = this.current.subscriptions.get(id)
    assert.ok(stream !== undefined, `no live stream for subscription ${id}`)
    for (let i = 0; i < bytes.byteLength; i += 13) stream.enqueue(bytes.slice(i, i + 13))
  }
}

class MockTransport {
  readonly ready = Promise.resolve()
  readonly closed: Promise<void>
  readonly incomingUnidirectionalStreams: ReadableStream<ReadableStream<Uint8Array>>
  readonly subscriptions = new Map<number, ReadableStreamDefaultController<Uint8Array>>()
  private _incoming!: ReadableStreamDefaultController<ReadableStream<Uint8Array>>
  private _drop!: () => void

  constructor (private readonly _server: MockServer, readonly url: string) {
    this.closed = new Promise(resolve => { this._drop = resolve })
    this.incomingUnidirectionalStreams = new ReadableStream({ start: c => { this._incoming = c } })
    _server.transports.push(this)
  }

  async createBidirectionalStream (): Promise<{ readable: ReadableStream<Uint8Array>, writable: WritableStream<Uint8Array> }> {
    const chunks: Uint8Array[] = []
    let respond!: (bytes: Uint8Array) => void
    const readable = new ReadableStream<Uint8Array>({
      start: c => { respond = bytes => { if (bytes.byteLength > 0) c.enqueue(bytes); c.close() } }
    })
    const writable = new WritableStream<Uint8Array>({
      write: chunk => { chunks.push(chunk) },
      close: () => {
        const line = new TextDecoder().decode(concat(chunks))
        assert.ok(line.endsWith('\n'), 'request is one JSON line')
        this._server.handle(this, JSON.parse(line), respond)
      }
    })
    return await Promise.resolve({ readable, writable })
  }

  openSubscription (id: number): void {
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const stream = new ReadableStream<Uint8Array>({ start: c => { controller = c } })
    const header = new Uint8Array(4)
    new DataView(header.buffer).setUint32(0, id, true)
    controller.enqueue(header.slice(0, 2)) // split the id header too
    controller.enqueue(header.slice(2))
    this.subscriptions.set(id, controller)
    this._incoming.enqueue(stream)
  }

  /** Simulate the connection dropping. */
  drop (): void {
    this.subscriptions.forEach(c => { c.error(new Error('reset')) })
    this._incoming.error(new Error('reset'))
    this._drop()
  }

  close (): void { this._drop() }
}

describe('WebTransportDatafeed', () => {
  let feed: WebTransportDatafeed | null = null
  afterEach(() => {
    feed?.close()
    feed = null
    delete (globalThis as any).WebTransport
  })

  it('reports support from the global constructor', () => {
    assert.equal(WebTransportDatafeed.isSupported(), false)
    new MockServer().install()
    assert.equal(WebTransportDatafeed.isSupported(), true)
  })

  it('connects lazily and answers history and search over request streams', async () => {
    const server = new MockServer()
    server.install()
    feed = new WebTransportDatafeed('https://feed.example/wt')
    assert.equal(server.transports.length, 0)

    const bars = await feed.getHistoryData(BTC, PERIOD, 10 * MIN, 19 * MIN)
    assert.deepEqual(bars, server.history.slice(10, 20))
    assert.deepEqual(server.requests[0], { type: 'history', ticker: 'BTCUSDT', exchange: 'BINANCE', multiplier: 1, timespan: 'minute', from: 10 * MIN, to: 19 * MIN })
    assert.deepEqual(await feed.searchSymbols('ETH'), [ETH])
    assert.equal(server.transports.length, 1, 'one connection for everything')
  })

  it('rejects an invalid history frame', async () => {
    const server = new MockServer()
    server.install()
    server.rawHistory = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17])
    feed = new WebTransportDatafeed('https://feed.example/wt')
    await assert.rejects(feed.getHistoryData(BTC, PERIOD, 0, MIN), /invalid history frame/)
  })

  it('delivers each subscription its own bars, coalescing bursts to the newest version', async () => {
    const server = new MockServer()
    server.install()
    feed = new WebTransportDatafeed('https://feed.example/wt')
    const btc: CandleData[] = []
    const eth: CandleData[] = []
    feed.subscribe(BTC, PERIOD, b => btc.push(b))
    feed.subscribe(ETH, PERIOD, b => eth.push(b))
    await sleep(10)
    const [subBtc, subEth] = server.requests.filter(r => r.type === 'subscribe')
    assert.equal(subBtc.ticker, 'BTCUSDT')
    assert.notEqual(subBtc.id, subEth.id)

    server.push(subBtc.id, [bar(60, 1)])
    server.push(subBtc.id, [bar(60, 2), bar(61, 3)]) // same-timestamp update in the same burst
    server.push(subEth.id, [bar(60, 50)])
    await sleep(10)
    assert.deepEqual(btc.map(b => [b.timestamp / MIN, b.close]), [[60, 2], [61, 3]])
    assert.deepEqual(eth.map(b => b.close), [50])
  })

  it('stops delivery and tells the server on unsubscribe', async () => {
    const server = new MockServer()
    server.install()
    feed = new WebTransportDatafeed('https://feed.example/wt')
    const got: CandleData[] = []
    feed.subscribe(BTC, PERIOD, b => got.push(b))
    await sleep(10)
    const { id } = server.requests.find(r => r.type === 'subscribe')!
    feed.unsubscribe(BTC, PERIOD)
    await sleep(10)
    assert.deepEqual(server.requests.at(-1), { type: 'unsubscribe', id })
    assert.equal(server.current.subscriptions.size, 0)
    assert.equal(got.length, 0)
  })

  it('reconnects after a drop and re-subscribes with the same ids', async () => {
    const server = new MockServer()
    server.install()
    feed = new WebTransportDatafeed({ url: 'https://feed.example/wt', reconnectDelayMs: { initial: 5, max: 20 } })
    const got: CandleData[] = []
    feed.subscribe(BTC, PERIOD, b => got.push(b))
    await sleep(10)
    const { id } = server.requests.find(r => r.type === 'subscribe')!

    server.current.drop()
    await sleep(40)
    assert.equal(server.transports.length, 2, 'reconnected')
    const resubscribes = server.requests.filter(r => r.type === 'subscribe')
    assert.equal(resubscribes.length, 2)
    assert.equal(resubscribes[1].id, id)

    server.push(id, [bar(70, 7)])
    await sleep(10)
    assert.deepEqual(got.map(b => b.close), [7])
  })
})
