import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, describe, it } from 'node:test'
import vm from 'node:vm'

import movingAverage from '../engine/extension/indicator/movingAverage'
import exponentialMovingAverage from '../engine/extension/indicator/exponentialMovingAverage'
import relativeStrengthIndex from '../engine/extension/indicator/relativeStrengthIndex'
import bollingerBands from '../engine/extension/indicator/bollingerBands'
import type { IndicatorTemplate } from '../engine/component/Indicator'
import { createKernel, runKernel, type IndicatorKind } from '../engine/workers/TypedArrayIndicators'
import workerSource from '../engine/workers/indicatorWorkerSource.generated'
import { IndicatorWorkerPool } from '../engine/workers/IndicatorWorkerPool'
import { configureIndicatorWorkers, setIndicatorWorkerPoolFactory, withWorkerOffload } from '../engine/workers/indicatorOffload'
// @ts-expect-error — plain JS build script without type declarations
import { generate, OUTPUT } from '../../scripts/gen-indicator-worker.mjs'
import type { CandleData } from '../types'

type Template = IndicatorTemplate<any, any, any>

const TEMPLATES: Record<IndicatorKind, Template> = {
  MA: movingAverage,
  EMA: exponentialMovingAverage,
  RSI: relativeStrengthIndex,
  BOLL: bollingerBands
}

const PARAM_SETS: Record<IndicatorKind, number[][]> = {
  MA: [[5, 10, 30, 60], [1], [3, 7]],
  EMA: [[6, 12, 20], [1], [9, 26]],
  RSI: [[6, 12, 24], [1], [14]],
  BOLL: [[20, 2], [5, 2.5], [1, 3]]
}

function seeded (seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

function makeBars (n: number, seed = 1, closeOf?: (i: number, rnd: () => number) => number): CandleData[] {
  const rnd = seeded(seed)
  let price = 1000
  return Array.from({ length: n }, (_, i) => {
    price = closeOf !== undefined ? closeOf(i, rnd) : price + (rnd() - 0.5) * 8
    return { timestamp: i * 60_000, open: price, high: price + 1, low: price - 1, close: price, volume: 1 }
  })
}

// Edge cases for RSI: no deltas at all (loss sum 0 → 0), only losses before the
// first gain (gain sum unset → NaN), and repeated equal closes.
const DATASETS: Array<[string, CandleData[]]> = [
  ['random walk', makeBars(400, 7)],
  ['flat', makeBars(60, 1, () => 50)],
  ['falling then rising', makeBars(80, 1, i => (i < 30 ? 100 - i : 70 + (i - 30) * 2))],
  ['steps', makeBars(120, 3, (i, r) => Math.round(r() * 4) + 100)],
  ['shorter than the period', makeBars(3, 9)]
]

function mockIndicator (template: Template, params: number[]): any {
  const figures = template.regenerateFigures?.(params) ?? template.figures
  return { calcParams: params, figures, result: [] }
}

function kernelRows (kind: IndicatorKind, params: number[], indicator: any, bars: CandleData[]): unknown[] {
  const kernel = createKernel(kind, params)
  const keys = kind === 'BOLL' ? ['up', 'mid', 'dn'] : indicator.figures.map((f: { key: string }) => f.key)
  const { outputs } = runKernel(kernel, i => bars[i].close, bars.length)
  return bars.map((_, i) => {
    const row: Record<string, number> = {}
    for (let s = 0; s < kernel.outputs; s++) {
      if (i >= kernel.firstIndex(s)) row[keys[s]] = outputs[s][i]
    }
    return row
  })
}

function nextBar (bars: CandleData[], close: number): CandleData {
  const t = bars[bars.length - 1].timestamp + 60_000
  return { timestamp: t, open: close, high: close + 1, low: close - 1, close, volume: 1 }
}

describe('indicator kernels', () => {
  for (const kind of Object.keys(TEMPLATES) as IndicatorKind[]) {
    it(`${kind} is bit-identical to the engine template`, () => {
      for (const params of PARAM_SETS[kind]) {
        for (const [name, bars] of DATASETS) {
          const indicator = mockIndicator(TEMPLATES[kind], params)
          const expected = TEMPLATES[kind].calc(bars, indicator)
          assert.deepStrictEqual(kernelRows(kind, params, indicator, bars), expected, `${kind}(${params}) on ${name}`)
        }
      }
    })
  }
})

describe('generated worker source', () => {
  it('is up to date with indicatorWorker.entry.ts and the kernels', async () => {
    assert.equal(readFileSync(OUTPUT as string, 'utf8'), await generate(), 'run `pnpm gen:worker`')
  })

  it('computes the same outputs as the main-thread kernels', () => {
    const replies: any[] = []
    const scope: any = { onmessage: null, postMessage: (message: unknown) => { replies.push(message) } }
    vm.runInNewContext(workerSource, { self: scope, Float64Array })
    const bars = makeBars(300, 5)
    for (const kind of Object.keys(TEMPLATES) as IndicatorKind[]) {
      const params = PARAM_SETS[kind][0]
      scope.onmessage({ data: { id: 1, kind, params, closes: Float64Array.from(bars, b => b.close) } })
      const reply = replies.pop()
      const expected = runKernel(createKernel(kind, params), i => bars[i].close, bars.length)
      // Array.from: the reply's arrays come from the vm realm, which deepStrictEqual would compare by prototype.
      assert.deepStrictEqual(Array.from(reply.outputs as Float64Array[], o => Array.from(o)), expected.outputs.map(o => Array.from(o)), kind)
      assert.deepStrictEqual(Array.from(reply.stateBeforeLast as number[]), expected.stateBeforeLast, `${kind} state`)
    }
  })
})

describe('IndicatorWorkerPool', () => {
  const realWorker = (globalThis as any).Worker
  afterEach(() => { (globalThis as any).Worker = realWorker })

  class FakeWorker {
    static mode: 'answer' | 'silent' | 'throw' = 'answer'
    onmessage: ((e: { data: unknown }) => void) | null = null
    onerror: ((e: unknown) => void) | null = null
    onmessageerror: (() => void) | null = null
    constructor () { if (FakeWorker.mode === 'throw') throw new Error('blocked by CSP') }
    postMessage (job: any): void {
      if (FakeWorker.mode !== 'answer') return
      const run = runKernel(createKernel(job.kind, job.params), i => job.closes[i], job.closes.length)
      setTimeout(() => this.onmessage?.({ data: { id: job.id, ...run } }), 0)
    }
    terminate (): void {}
  }

  it('starts dead and rejects at once when workers cannot be created', async () => {
    (globalThis as any).Worker = FakeWorker
    FakeWorker.mode = 'throw'
    const pool = new IndicatorWorkerPool(2)
    assert.equal(pool.alive, false)
    await assert.rejects(pool.run('MA', [5], new Float64Array(10)), /unavailable/)
  })

  it('answers jobs, and rejects everything when a worker times out', async () => {
    (globalThis as any).Worker = FakeWorker
    FakeWorker.mode = 'answer'
    const pool = new IndicatorWorkerPool(2, 50)
    const result = await pool.run('EMA', [3], Float64Array.from([1, 2, 3, 4, 5]))
    assert.equal(result.outputs[0][4], runKernel(createKernel('EMA', [3]), i => i + 1, 5).outputs[0][4])
    FakeWorker.mode = 'silent'
    await assert.rejects(pool.run('EMA', [3], new Float64Array(5)), /timed out/)
    assert.equal(pool.alive, false)
  })

  it('rejects pending jobs on destroy', async () => {
    (globalThis as any).Worker = FakeWorker
    FakeWorker.mode = 'silent'
    const pool = new IndicatorWorkerPool(1, 10_000)
    const job = pool.run('MA', [2], new Float64Array(4))
    pool.destroy()
    await assert.rejects(job, /destroyed/)
  })
})

describe('withWorkerOffload', () => {
  afterEach(() => {
    configureIndicatorWorkers({ enabled: false, minBars: 20_000 })
    setIndicatorWorkerPoolFactory(null)
  })

  /** A pool stand-in that computes synchronously and counts jobs. */
  function fakePool (delayMs: (job: number) => number = () => 0): { runs: number, factory: () => Promise<any> } {
    const state = { runs: 0, factory: async () => await Promise.resolve(pool) }
    const pool = {
      alive: true,
      destroy: () => {},
      run: async (kind: IndicatorKind, params: number[], closes: Float64Array) => {
        const job = ++state.runs
        const run = runKernel(createKernel(kind, params), i => closes[i], closes.length)
        await new Promise(resolve => setTimeout(resolve, delayMs(job)))
        return run
      }
    }
    return state
  }

  for (const kind of Object.keys(TEMPLATES) as IndicatorKind[]) {
    it(`${kind}: full run in a worker, then ticks and new bars step only the tail`, async () => {
      const pool = fakePool()
      setIndicatorWorkerPoolFactory(pool.factory)
      configureIndicatorWorkers({ enabled: true, minBars: 50 })
      const template = TEMPLATES[kind]
      const wrapped = withWorkerOffload(template, kind)
      const params = PARAM_SETS[kind][0]
      const indicator = mockIndicator(template, params)
      const bars = makeBars(200, 11)

      assert.deepStrictEqual(await wrapped.calc(bars, indicator), template.calc(bars, indicator), 'full')
      assert.equal(pool.runs, 1)

      bars[bars.length - 1].close += 3.25 // tick
      assert.deepStrictEqual(await wrapped.calc(bars, indicator), template.calc(bars, indicator), 'tick')

      bars.push(nextBar(bars, 990)) // new bar
      bars.push(nextBar(bars, 995))
      bars[bars.length - 1].close -= 2 // and a tick on it
      assert.deepStrictEqual(await wrapped.calc(bars, indicator), template.calc(bars, indicator), 'append')
      assert.equal(pool.runs, 1, 'ticks and appends stay on the main thread')
    })
  }

  it('clears stale values at once when the data changes, then fills them', async () => {
    setIndicatorWorkerPoolFactory(fakePool().factory)
    configureIndicatorWorkers({ enabled: true, minBars: 50 })
    const wrapped = withWorkerOffload(exponentialMovingAverage, 'EMA')
    const indicator = mockIndicator(exponentialMovingAverage, [6, 12, 20])
    indicator.result = await wrapped.calc(makeBars(100, 1), indicator)
    const otherSymbol = makeBars(100, 2)
    const pending = wrapped.calc(otherSymbol, indicator)
    assert.deepStrictEqual(indicator.result, [], 'previous symbol values cleared before the worker answers')
    assert.deepStrictEqual(await pending, exponentialMovingAverage.calc(otherSymbol, indicator))
  })

  it('never lets an older full run land after a newer one', async () => {
    const pool = fakePool(job => (job === 1 ? 40 : 0)) // first job is slow
    setIndicatorWorkerPoolFactory(pool.factory)
    configureIndicatorWorkers({ enabled: true, minBars: 50 })
    const wrapped = withWorkerOffload(movingAverage, 'MA')
    const indicator = mockIndicator(movingAverage, [5, 10])
    const a = makeBars(100, 1)
    const b = makeBars(100, 2)
    const [first, second] = await Promise.all([wrapped.calc(a, indicator), wrapped.calc(b, indicator)])
    const expected = movingAverage.calc(b, indicator)
    assert.deepStrictEqual(second, expected)
    assert.deepStrictEqual(first, expected, 'the slow, older run resolves to the newest result')
  })

  it('falls back to the main thread when the worker fails, and stops using workers', async () => {
    let runs = 0
    setIndicatorWorkerPoolFactory(async () => await Promise.resolve({
      alive: true, destroy: () => {}, run: async () => { runs++; throw new Error('boom') }
    } as any))
    configureIndicatorWorkers({ enabled: true, minBars: 50 })
    const wrapped = withWorkerOffload(relativeStrengthIndex, 'RSI')
    const indicator = mockIndicator(relativeStrengthIndex, [6, 12, 24])
    const bars = makeBars(120, 4)
    assert.deepStrictEqual(await wrapped.calc(bars, indicator), relativeStrengthIndex.calc(bars, indicator))
    assert.deepStrictEqual(await wrapped.calc(makeBars(120, 5), indicator), relativeStrengthIndex.calc(makeBars(120, 5), indicator))
    assert.equal(runs, 1)
  })

  it('uses the template unchanged when disabled, below minBars, or for unsupported params', () => {
    const wrapped = withWorkerOffload(bollingerBands, 'BOLL')
    const bars = makeBars(100, 6)
    const indicator = mockIndicator(bollingerBands, [20, 2])
    assert.ok(Array.isArray(wrapped.calc(bars, indicator)), 'disabled → synchronous result')
    configureIndicatorWorkers({ enabled: true, minBars: 500 })
    assert.ok(Array.isArray(wrapped.calc(bars, indicator)), 'below minBars → synchronous result')
    configureIndicatorWorkers({ enabled: true, minBars: 10 })
    // The kernels only take integer periods; anything else goes to the template's own calc.
    const sentinel = [{ from: 'template' }]
    const stubbed = withWorkerOffload({ ...bollingerBands, calc: () => sentinel }, 'BOLL')
    assert.equal(stubbed.calc(bars, mockIndicator(bollingerBands, [20.5, 2])), sentinel, 'non-integer period → template')
  })
})
