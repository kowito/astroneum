/**
 * P6-C: Performance regression baseline tests.
 *
 * These tests verify that core hot-path algorithms complete within defined
 * time budgets.  They run in Node.js via `tsx --test` so no browser is
 * required.  Each test measures CPU time for a representative N-bar workload
 * and asserts it is below a generous but meaningful threshold.
 *
 * Thresholds are set at roughly 10× the measured baseline on a 2024 MacBook
 * Pro M3 to avoid false failures on slower CI runners.
 *
 * ┌──────────────────────────────────────────────┬───────────┬──────────────┐
 * │ Test                                         │ N bars    │ Budget (ms)  │
 * ├──────────────────────────────────────────────┼───────────┼──────────────┤
 * │ MA(5,10,30,60) kernel, full run              │ 50,000    │ 25 ms        │
 * │ EMA(6,12,20) kernel, full run                │ 50,000    │ 25 ms        │
 * │ RSI(6,12,24) kernel, full run                │ 50,000    │ 40 ms        │
 * │ BOLL(20,2) kernel, full run                  │ 50,000    │ 30 ms        │
 * │ EMA tick: step the last bar from saved state │ 1,000 ×   │ 5 ms         │
 * │ BarsCodec v2 encode + decode round-trip      │ 50,000    │ 60 ms        │
 * └──────────────────────────────────────────────┴───────────┴──────────────┘
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createKernel, runKernel } from '../../engine/workers/TypedArrayIndicators.js'
import { BarsCodec } from '../../datafeed/codec/BarsCodec.js'
import type { CandleData } from '../../types.js'

// ── Test data generation ──────────────────────────────────────────────────

const N = 50_000

function makeBars (n: number): CandleData[] {
  const bars: CandleData[] = new Array(n)
  let price = 100
  const now  = Date.UTC(2024, 0, 1)
  for (let i = 0; i < n; i++) {
    price = price + (Math.random() - 0.5) * 2
    const open  = price
    const close = price + (Math.random() - 0.5)
    const high  = Math.max(open, close) + Math.random() * 0.5
    const low   = Math.min(open, close) - Math.random() * 0.5
    bars[i] = {
      timestamp: now + i * 60_000,
      open,
      high,
      low,
      close,
      volume: Math.round(Math.random() * 1_000_000)
    }
  }
  return bars
}

const BARS = makeBars(N)
const CLOSES = Float64Array.from(BARS, bar => bar.close)
const closeAt = (i: number): number => CLOSES[i]

// ── Helpers ───────────────────────────────────────────────────────────────

function elapsedMs (fn: () => void): number {
  const t0 = performance.now()
  fn()
  return performance.now() - t0
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('P6-C perf baseline', () => {
  it('MA(5,10,30,60) kernel on 50K closes < 25 ms', () => {
    const kernel = createKernel('MA', [5, 10, 30, 60])
    const ms = elapsedMs(() => { runKernel(kernel, closeAt, N) })
    assert.ok(ms < 25, `MA took ${ms.toFixed(2)} ms (budget: 25 ms)`)
  })

  it('EMA(6,12,20) kernel on 50K closes < 25 ms', () => {
    const kernel = createKernel('EMA', [6, 12, 20])
    const ms = elapsedMs(() => { runKernel(kernel, closeAt, N) })
    assert.ok(ms < 25, `EMA took ${ms.toFixed(2)} ms (budget: 25 ms)`)
  })

  it('RSI(6,12,24) kernel on 50K closes < 40 ms', () => {
    const kernel = createKernel('RSI', [6, 12, 24])
    const ms = elapsedMs(() => { runKernel(kernel, closeAt, N) })
    assert.ok(ms < 40, `RSI took ${ms.toFixed(2)} ms (budget: 40 ms)`)
  })

  it('BOLL(20,2) kernel on 50K closes < 30 ms', () => {
    const kernel = createKernel('BOLL', [20, 2])
    const ms = elapsedMs(() => { runKernel(kernel, closeAt, N) })
    assert.ok(ms < 30, `BOLL took ${ms.toFixed(2)} ms (budget: 30 ms)`)
  })

  it('1,000 EMA ticks stepped from saved state < 5 ms', () => {
    const kernel = createKernel('EMA', [6, 12, 20])
    const { stateBeforeLast } = runKernel(kernel, closeAt, N)
    const out = new Array<number>(kernel.outputs)
    const ms = elapsedMs(() => {
      for (let t = 0; t < 1_000; t++) {
        kernel.step(stateBeforeLast!.slice(), closeAt, N - 1, out)
      }
    })
    assert.ok(ms < 5, `1,000 EMA ticks took ${ms.toFixed(2)} ms (budget: 5 ms)`)
  })

  it('BarsCodec encode+decode 50K bars < 60 ms', () => {
    const ms = elapsedMs(() => {
      const encoded = BarsCodec.encode(BARS)
      const decoded = BarsCodec.decode(encoded)
      assert.equal(decoded.length, N)
    })
    assert.ok(ms < 60, `BarsCodec round-trip took ${ms.toFixed(2)} ms (budget: 60 ms)`)
  })
})
