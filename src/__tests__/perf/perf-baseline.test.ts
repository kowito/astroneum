/**
 * P6-C: Performance regression baseline tests.
 *
 * These tests verify that core hot-path algorithms complete within defined
 * time budgets.  They run in Node.js via `tsx --test` so no browser is
 * required.  Each test measures CPU time for a representative N-bar workload
 * and asserts it is below a generous but meaningful threshold.
 *
 * Thresholds are set at 10× the measured baseline on a 2024 MacBook Pro M3
 * to avoid false failures on slower CI runners.
 *
 * ┌──────────────────────────────────────────────┬───────────┬──────────────┐
 * │ Test                                         │ N bars    │ Budget (ms)  │
 * ├──────────────────────────────────────────────┼───────────┼──────────────┤
 * │ WasmIndicators packBars                      │ 50,000    │ 10 ms        │
 * │ WasmIndicators SMA (close col)               │ 50,000    │ 10 ms        │
 * │ WasmIndicators EMA (close col)               │ 50,000    │ 10 ms        │
 * │ WasmIndicators RSI (close col)               │ 50,000    │ 15 ms        │
 * │ WasmIndicators Bollinger Bands               │ 50,000    │ 15 ms        │
 * │ BarsCodec encode + decode round-trip         │ 50,000    │ 25 ms        │
 * │ SabRingBuffer push + pop 50 K bars           │ 50,000    │ 15 ms        │
 * └──────────────────────────────────────────────┴───────────┴──────────────┘
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { packBars, sma, ema, rsi, bollingerBands } from '../../engine/workers/WasmIndicators.js'
import { BarsCodec } from '../../datafeed/codec/BarsCodec.js'
import { SabRingBuffer } from '../../engine/common/SabRingBuffer.js'
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

// ── Helpers ───────────────────────────────────────────────────────────────

function elapsedMs (fn: () => void): number {
  const t0 = performance.now()
  fn()
  return performance.now() - t0
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('P6-C perf baseline', () => {
  it('packBars 50K bars < 10 ms', () => {
    const ms = elapsedMs(() => { packBars(BARS) })
    assert.ok(ms < 10, `packBars took ${ms.toFixed(2)} ms (budget: 10 ms)`)
  })

  it('SMA(20) on 50K close values < 10 ms', () => {
    const store = packBars(BARS)
    const close = store.close()
    const ms = elapsedMs(() => { sma(close, 20) })
    assert.ok(ms < 10, `SMA took ${ms.toFixed(2)} ms (budget: 10 ms)`)
  })

  it('EMA(20) on 50K close values < 10 ms', () => {
    const store = packBars(BARS)
    const close = store.close()
    const ms = elapsedMs(() => { ema(close, 20) })
    assert.ok(ms < 10, `EMA took ${ms.toFixed(2)} ms (budget: 10 ms)`)
  })

  it('RSI(14) on 50K close values < 15 ms', () => {
    const store = packBars(BARS)
    const close = store.close()
    const ms = elapsedMs(() => { rsi(close, 14) })
    assert.ok(ms < 15, `RSI took ${ms.toFixed(2)} ms (budget: 15 ms)`)
  })

  it('Bollinger Bands(20,2) on 50K values < 15 ms', () => {
    const store = packBars(BARS)
    const close = store.close()
    const ms = elapsedMs(() => { bollingerBands(close, 20, 2) })
    assert.ok(ms < 15, `BollingerBands took ${ms.toFixed(2)} ms (budget: 15 ms)`)
  })

  it('BarsCodec encode+decode 50K bars < 25 ms', () => {
    const ms = elapsedMs(() => {
      const encoded = BarsCodec.encode(BARS)
      const decoded = BarsCodec.decode(encoded)
      assert.equal(decoded.length, N)
    })
    assert.ok(ms < 25, `BarsCodec round-trip took ${ms.toFixed(2)} ms (budget: 25 ms)`)
  })

  it('SabRingBuffer push+pop 50K bars < 15 ms', () => {
    const ring = SabRingBuffer.create(N + 1)
    const ms = elapsedMs(() => {
      for (let i = 0; i < N; i++) {
        ring.push(BARS[i])
      }
      let count = 0
      while (ring.pop() !== null) count++
      assert.equal(count, N)
    })
    assert.ok(ms < 15, `SabRingBuffer push+pop took ${ms.toFixed(2)} ms (budget: 15 ms)`)
  })
})
