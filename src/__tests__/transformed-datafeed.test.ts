import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { heikinAshi } from '../chart/PerformanceMode'
import { generateRenko } from '../chart/NonTimeBars'
import { createTransformedDatafeed } from '../chart/TransformedDatafeed'
import type { CandleData, Datafeed, DatafeedSubscribeCallback, Period, SymbolInfo } from '../types'

const MIN = 60_000
const SYMBOL: SymbolInfo = { ticker: 'BTCUSDT', exchange: 'BINANCE' }
const PERIOD: Period = { multiplier: 1, timespan: 'minute', text: '1m' }

function bar (minute: number, close: number, spread = 1): CandleData {
  return { timestamp: minute * MIN, open: close - 0.4, high: close + spread, low: close - spread, close, volume: 10 }
}

/** A base datafeed whose live ticks the test pushes by hand. */
function fakeBase (history: CandleData[]) {
  let tick: DatafeedSubscribeCallback | null = null
  const calls: string[] = []
  const base: Datafeed = {
    searchSymbols: async () => await Promise.resolve([SYMBOL]),
    getHistoryData: async (_s, _p, from, to) => {
      calls.push(`history ${from}-${to}`)
      return await Promise.resolve(history.filter(b => b.timestamp >= from && b.timestamp <= to))
    },
    subscribe: (_s, _p, cb) => { tick = cb; calls.push('subscribe') },
    unsubscribe: () => { tick = null; calls.push('unsubscribe') }
  }
  return { base, calls, emit: (b: CandleData) => { tick?.(b) }, get live () { return tick !== null } }
}

/** What the chart would hold after applying the same updates it applies to live bars. */
function applyToChart (chart: CandleData[], update: CandleData): void {
  const last = chart[chart.length - 1]
  if (last === undefined || update.timestamp > last.timestamp) chart.push(update)
  else if (update.timestamp === last.timestamp) chart[chart.length - 1] = update
}

describe('createTransformedDatafeed', () => {
  const history = Array.from({ length: 40 }, (_, i) => bar(i, 100 + Math.sin(i / 3) * 6 + i * 0.2))

  it('serves the derived history and passes search through', async () => {
    const f = fakeBase(history)
    const feed = createTransformedDatafeed(f.base, () => heikinAshi)
    assert.deepEqual(await feed.searchSymbols(''), [SYMBOL])
    const served = await feed.getHistoryData(SYMBOL, PERIOD, 0, 100 * MIN)
    assert.deepEqual(served, heikinAshi(history))
  })

  it('keeps a Heikin-Ashi chart identical to a full recompute through ticks and new bars', async () => {
    const f = fakeBase(history)
    const feed = createTransformedDatafeed(f.base, () => heikinAshi)
    const chart = await feed.getHistoryData(SYMBOL, PERIOD, 0, 100 * MIN)
    feed.subscribe(SYMBOL, PERIOD, update => { applyToChart(chart, update) })

    const raw = history.slice()
    const ticks = [bar(39, 112), bar(39, 108), bar(40, 109), bar(40, 111, 3), bar(41, 104), bar(41, 107)]
    for (const t of ticks) {
      const i = raw.findIndex(b => b.timestamp === t.timestamp)
      if (i === -1) raw.push(t)
      else raw[i] = t
      f.emit(t)
      assert.deepEqual(chart, heikinAshi(raw), `after tick at minute ${t.timestamp / MIN}`)
    }
  })

  it('appends only new Renko bricks and never rewrites earlier ones', async () => {
    const f = fakeBase(history)
    const seen: CandleData[] = []
    const feed = createTransformedDatafeed(f.base, () => bars => generateRenko(bars, 2))
    const chart = await feed.getHistoryData(SYMBOL, PERIOD, 0, 100 * MIN)
    const initial = chart.length
    feed.subscribe(SYMBOL, PERIOD, update => { seen.push(update); applyToChart(chart, update) })

    const lastBrick = chart[chart.length - 1].close
    const quiet = bar(40, lastBrick + 0.3)   // less than one brick away from the last brick
    f.emit(quiet)
    assert.equal(seen.length, 0, 'a tick that completes no brick emits nothing')

    const rally = bar(41, lastBrick + 40)    // a big move: several new bricks
    f.emit(rally)
    assert.ok(seen.length >= 2, 'new bricks are emitted')
    assert.deepEqual(chart, generateRenko([...history, quiet, rally], 2))
    assert.ok(chart.length > initial)
    assert.ok(seen.every((b, i) => i === 0 || b.timestamp > seen[i - 1].timestamp), 'bricks arrive in order')
  })

  it('fixes parameters once per loaded series (the factory runs on the history only)', async () => {
    const f = fakeBase(history)
    let factoryCalls = 0
    const feed = createTransformedDatafeed(f.base, () => { factoryCalls++; return bars => bars })
    await feed.getHistoryData(SYMBOL, PERIOD, 0, 100 * MIN)
    feed.subscribe(SYMBOL, PERIOD, () => undefined)
    f.emit(bar(40, 101))
    f.emit(bar(41, 102))
    assert.equal(factoryCalls, 1)
  })

  it('has no older history to give once a series is loaded, but rebuilds on a fresh load', async () => {
    const f = fakeBase(history)
    const feed = createTransformedDatafeed(f.base, () => heikinAshi)
    await feed.getHistoryData(SYMBOL, PERIOD, 10 * MIN, 39 * MIN)
    // the chart then asks for the window before the first bar
    assert.deepEqual(await feed.getHistoryData(SYMBOL, PERIOD, 0, 10 * MIN), [])
    // a new initial load (window ending at the latest bar) is served again
    const again = await feed.getHistoryData(SYMBOL, PERIOD, 10 * MIN, 39 * MIN)
    assert.equal(again.length, 30)
  })

  it('ignores out-of-order ticks and stops on unsubscribe', async () => {
    const f = fakeBase(history)
    const feed = createTransformedDatafeed(f.base, () => heikinAshi)
    const chart = await feed.getHistoryData(SYMBOL, PERIOD, 0, 100 * MIN)
    const before = chart.slice()
    let updates = 0
    feed.subscribe(SYMBOL, PERIOD, u => { updates++; applyToChart(chart, u) })
    f.emit(bar(3, 999)) // far in the past
    assert.equal(updates, 0)
    assert.deepEqual(chart, before)
    feed.unsubscribe(SYMBOL, PERIOD)
    assert.equal(f.live, false)
    assert.ok(f.calls.includes('unsubscribe'))
  })

  it('keeps series for different symbols and periods apart', async () => {
    const f = fakeBase(history)
    const feed = createTransformedDatafeed(f.base, () => heikinAshi)
    const eth: SymbolInfo = { ticker: 'ETHUSDT', exchange: 'BINANCE' }
    await feed.getHistoryData(SYMBOL, PERIOD, 0, 100 * MIN)
    await feed.getHistoryData(eth, PERIOD, 0, 100 * MIN)
    feed.unsubscribe(SYMBOL, PERIOD)
    // the other series survives: a forward request for it is still recognised
    assert.deepEqual(await feed.getHistoryData(eth, PERIOD, 0, 0), [])
  })
})
