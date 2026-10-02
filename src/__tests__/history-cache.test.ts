import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { BarsCodec } from '../datafeed/codec/BarsCodec'
import { HistoryCache, type HistoryLoadRequest } from '../datafeed/HistoryCache'
import { MemoryBarStore } from '../datafeed/BarStore'
import type { CandleData, Period, SymbolInfo } from '../types'

const MIN = 60_000
const SYMBOL: SymbolInfo = { ticker: 'BTCUSDT', exchange: 'BINANCE' }
const PERIOD: Period = { multiplier: 1, timespan: 'minute', text: '1m' }

function bar (t: number, close = 100 + t / MIN, volume: number | undefined = 10): CandleData {
  const b: CandleData = { timestamp: t, open: close - 1, high: close + 1, low: close - 2, close }
  if (volume !== undefined) b.volume = volume
  return b
}

function series (fromMin: number, toMin: number, closeOf = (m: number) => 100 + m): CandleData[] {
  const out: CandleData[] = []
  for (let m = fromMin; m <= toMin; m++) out.push(bar(m * MIN, closeOf(m)))
  return out
}

/** A fake datafeed over a fixed "server" series that records every request. */
function feed (server: () => CandleData[]) {
  const calls: Array<[number, number]> = []
  let fail = false
  const fetch = async (from: number, to: number): Promise<CandleData[]> => {
    calls.push([from, to])
    if (fail) throw new Error('offline')
    return await Promise.resolve(server().filter(b => b.timestamp >= from && b.timestamp <= to))
  }
  return { fetch, calls, setOffline: (v: boolean) => { fail = v } }
}

function initReq (fetch: HistoryLoadRequest['fetch'], fromMin: number, toMin: number): HistoryLoadRequest {
  return { type: 'init', symbol: SYMBOL, period: PERIOD, from: fromMin * MIN, to: toMin * MIN, fetch }
}

describe('BarsCodec', () => {
  it('round-trips OHLCV, turnover, absent fields and pre-1970 timestamps', () => {
    const bars: CandleData[] = [
      { timestamp: -86_400_000, open: 1, high: 2, low: 0.5, close: 1.5 },
      { timestamp: 1_700_000_000_000, open: 10, high: 12, low: 9, close: 11, volume: 1234.5, turnover: 99 }
    ]
    const bytes = BarsCodec.encode(bars)
    assert.equal(bytes.byteLength, BarsCodec.HEADER_SIZE + 2 * BarsCodec.BAR_SIZE)
    assert.equal(BarsCodec.frameLength(bytes), bytes.byteLength)
    assert.deepEqual(BarsCodec.decode(bytes), bars)
  })

  it('rejects truncated, trailing or corrupt frames', () => {
    const bytes = BarsCodec.encode(series(0, 3))
    assert.deepEqual(BarsCodec.decode(bytes.subarray(0, bytes.byteLength - 1)), [])
    const padded = new Uint8Array(bytes.byteLength + 1)
    padded.set(bytes)
    assert.deepEqual(BarsCodec.decode(padded), [])
    const badMagic = bytes.slice()
    badMagic[0] ^= 0xff
    assert.equal(BarsCodec.frameLength(badMagic), null)
    const nanPrice = BarsCodec.encode([{ timestamp: 0, open: NaN, high: 1, low: 1, close: 1 }])
    assert.deepEqual(BarsCodec.decode(nanPrice), [])
  })
})

describe('HistoryCache', () => {
  it('fetches the full window on a cold cache, then only the tail', async () => {
    const cache = new HistoryCache(new MemoryBarStore())
    let server = series(0, 600)
    const f = feed(() => server)
    const key = cache.key(SYMBOL, PERIOD)

    const first = await cache.load(initReq(f.fetch, 100, 600))
    assert.equal(first.length, 501)
    assert.deepEqual(f.calls, [[100 * MIN, 600 * MIN]])
    await cache.flush(key)

    server = series(0, 610)
    const second = await cache.load(initReq(f.fetch, 110, 610))
    // Re-fetch starts two bars before the newest cached bar (598), not at the window start.
    assert.deepEqual(f.calls[1], [598 * MIN, 610 * MIN])
    assert.equal(second[0].timestamp, 110 * MIN)
    assert.equal(second[second.length - 1].timestamp, 610 * MIN)
    assert.equal(second.length, 501)
  })

  it('takes the fresh version of the bar that was still forming', async () => {
    const cache = new HistoryCache(new MemoryBarStore())
    let server = series(0, 50)
    const f = feed(() => server)
    await cache.load(initReq(f.fetch, 0, 50))
    await cache.flush(cache.key(SYMBOL, PERIOD))
    server = series(0, 52, m => (m === 50 ? 999 : 100 + m))
    const bars = await cache.load(initReq(f.fetch, 0, 52))
    assert.equal(bars.find(b => b.timestamp === 50 * MIN)?.close, 999)
    assert.equal(f.calls.length, 2)
  })

  it('drops the cache and refetches the window when a closed bar was adjusted', async () => {
    const cache = new HistoryCache(new MemoryBarStore())
    let server = series(0, 50)
    const f = feed(() => server)
    await cache.load(initReq(f.fetch, 0, 50))
    await cache.flush(cache.key(SYMBOL, PERIOD))
    server = series(0, 52, m => (m === 49 ? 555 : 100 + m)) // 49 was already closed
    const bars = await cache.load(initReq(f.fetch, 0, 52))
    assert.deepEqual(f.calls[2], [0, 52 * MIN], 'full window refetched')
    assert.equal(bars.find(b => b.timestamp === 49 * MIN)?.close, 555)
  })

  it('serves the cached window when the datafeed fails or returns nothing', async () => {
    const cache = new HistoryCache(new MemoryBarStore())
    let server = series(0, 50)
    const f = feed(() => server)
    await cache.load(initReq(f.fetch, 0, 50))
    await cache.flush(cache.key(SYMBOL, PERIOD))

    f.setOffline(true)
    assert.equal((await cache.load(initReq(f.fetch, 10, 55))).length, 41)
    f.setOffline(false)
    server = []
    assert.equal((await cache.load(initReq(f.fetch, 10, 55))).length, 41)
    // ...and an empty answer must not have wiped the cache
    assert.equal((await cache.read(cache.key(SYMBOL, PERIOD))).length, 51)
  })

  it('rethrows when there is nothing cached to fall back on', async () => {
    const cache = new HistoryCache(new MemoryBarStore())
    const f = feed(() => series(0, 10))
    f.setOffline(true)
    await assert.rejects(cache.load(initReq(f.fetch, 0, 10)), /offline/)
  })

  it('fills a window that starts before the cache, keeping the cached middle', async () => {
    const cache = new HistoryCache(new MemoryBarStore())
    const server = series(0, 300)
    const f = feed(() => server)
    const key = cache.key(SYMBOL, PERIOD)
    await cache.load(initReq(f.fetch, 200, 300))
    await cache.flush(key)
    const bars = await cache.load(initReq(f.fetch, 50, 300))
    assert.equal(bars.length, 251)
    await cache.flush(key)
    const stored = await cache.read(key)
    assert.equal(stored.length, 251, 'head + cached middle + tail, no gap')
    assert.equal(stored[0].timestamp, 50 * MIN)
  })

  it('serves older history from the cache, then prepends fetched bars at the anchor', async () => {
    const cache = new HistoryCache(new MemoryBarStore())
    const server = series(0, 1000)
    const f = feed(() => server)
    const key = cache.key(SYMBOL, PERIOD)
    await cache.load(initReq(f.fetch, 0, 1000))
    await cache.flush(key)
    const calls = f.calls.length

    const fromCache = await cache.load({
      type: 'forward', symbol: SYMBOL, period: PERIOD, from: 0, to: 0, anchor: 500 * MIN, count: 100, fetch: f.fetch
    })
    assert.equal(f.calls.length, calls, 'no network call')
    assert.equal(fromCache.length, 100)
    assert.equal(fromCache[fromCache.length - 1].timestamp, 499 * MIN)

    // Anchor at the oldest cached bar: fetch and prepend.
    const cache2 = new HistoryCache(new MemoryBarStore())
    await cache2.load(initReq(f.fetch, 500, 1000))
    await cache2.flush(key)
    const older = await cache2.load({
      type: 'forward', symbol: SYMBOL, period: PERIOD, from: 400 * MIN, to: 499 * MIN, anchor: 500 * MIN, fetch: f.fetch
    })
    assert.equal(older.length, 100)
    await cache2.flush(key)
    assert.equal((await cache2.read(key))[0].timestamp, 400 * MIN)
  })

  it('keys series by namespace, exchange and period, and caps them to maxBars', async () => {
    const store = new MemoryBarStore()
    const cache = new HistoryCache(store, { namespace: 'feedA', maxBars: 100 })
    const f = feed(() => series(0, 500))
    await cache.load(initReq(f.fetch, 0, 500))
    const key = cache.key(SYMBOL, PERIOD)
    await cache.flush(key)
    assert.equal(key, 'feedA/BINANCE:BTCUSDT/1minute')
    const stored = await cache.read(key)
    assert.equal(stored.length, 100)
    assert.equal(stored[stored.length - 1].timestamp, 500 * MIN, 'newest bars kept')
    assert.notEqual(cache.key({ ticker: 'BTCUSDT', exchange: 'OKX' }, PERIOD), key)
  })

  it('bypasses the cache for bars with extra fields', async () => {
    const store = new MemoryBarStore()
    const cache = new HistoryCache(store)
    const withExtra = series(0, 10).map(b => ({ ...b, openInterest: 5 }))
    const f = feed(() => withExtra)
    const bars = await cache.load(initReq(f.fetch, 0, 10))
    assert.equal(bars[0].openInterest, 5)
    await cache.flush(cache.key(SYMBOL, PERIOD))
    assert.deepEqual(await store.list(), [])
  })

  it('evicts older series when the quota is exceeded', async () => {
    const perSeries = BarsCodec.HEADER_SIZE + 11 * BarsCodec.BAR_SIZE
    const store = new MemoryBarStore({ quotaBytes: perSeries * 2 })
    const cache = new HistoryCache(store)
    const f = feed(() => series(0, 10))
    for (const ticker of ['A', 'B', 'C']) {
      const symbol = { ticker }
      await cache.load({ ...initReq(f.fetch, 0, 10), symbol })
      await cache.flush(cache.key(symbol, PERIOD))
    }
    const keys = (await store.list()).map(e => e.key).sort()
    assert.ok(keys.includes(cache.key({ ticker: 'C' }, PERIOD)), 'newest series written')
    assert.ok(!keys.includes(cache.key({ ticker: 'A' }, PERIOD)), 'oldest series evicted')
  })

  it('serializes concurrent writers for the same series', async () => {
    const cache = new HistoryCache(new MemoryBarStore())
    const f = feed(() => series(0, 100))
    const key = cache.key(SYMBOL, PERIOD)
    await Promise.all([cache.load(initReq(f.fetch, 0, 100)), cache.load(initReq(f.fetch, 0, 100))])
    await cache.flush(key)
    const stored = await cache.read(key)
    assert.equal(stored.length, 101)
    assert.ok(stored.every((b, i) => i === 0 || stored[i - 1].timestamp < b.timestamp))
  })
})
