/**
 * Opt-in acceleration for the built-in MA, EMA, RSI and BOLL indicators on
 * large series (see `configureIndicatorWorkers`).
 *
 * When enabled and a series has at least `minBars` bars:
 *   - A full recompute (new data, new params) runs in a Web Worker; the
 *     indicator's old values are cleared first if the data changed, so values
 *     for the previous symbol are never drawn over the new candles.
 *   - A tick (last bar changed) or newly appended bars are recomputed on the
 *     main thread by stepping only those bars from the kernel state kept from
 *     the last run — O(period) per bar instead of O(bars).
 * Results are identical to the template's own `calc`. Below `minBars`, when
 * disabled, or for parameters the kernels don't support, the template's `calc`
 * runs unchanged. If workers can't start or fail, everything stays on the main
 * thread for the rest of the session.
 */

import type { CandleData } from '../common/Data'
import type { Indicator, IndicatorTemplate } from '../component/Indicator'

import type { IndicatorWorkerPool } from './IndicatorWorkerPool'
import { createKernel, runKernel, validParams, type IndicatorKind, type Kernel, type KernelRun } from './TypedArrayIndicators'

export interface IndicatorWorkerOptions {
  /** Default `false`. */
  enabled?: boolean
  /** Smallest series (in bars) that uses the accelerated path. Default 20 000. */
  minBars?: number
  /** Default `min(navigator.hardwareConcurrency, 4)`. */
  maxWorkers?: number
}

type Row = Record<string, number>

interface Snapshot {
  dataList: CandleData[]
  paramsKey: string
  /** Bars covered by `rows`. */
  n: number
  /** Kernel state before bar `n - 1`. */
  state: number[]
  firstTimestamp: number
  /** Timestamp of bar `n - 2`; bars before `n - 1` never change within one array. */
  checkTimestamp: number
  rows: Row[]
}

interface Tracker {
  snapshot: Snapshot | null
  /** Bumped by every full run; the highest one is the result to keep. */
  seq: number
  latest: Promise<Row[]> | null
  pending: Promise<Row[]> | null
  pendingData: CandleData[] | null
}

const config = { enabled: false, minBars: 20_000, maxWorkers: 0 }
let pool: Promise<IndicatorWorkerPool | null> | null = null
let workersFailed = false
const trackers = new WeakMap<object, Tracker>()

type PoolFactory = (size: number) => Promise<IndicatorWorkerPool | null>

const defaultPoolFactory: PoolFactory = async (size) => {
  if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL.createObjectURL !== 'function') return null
  const { IndicatorWorkerPool } = await import('./IndicatorWorkerPool')
  return new IndicatorWorkerPool(size)
}
let poolFactory = defaultPoolFactory

/** Test hook: replace how worker pools are created (`null` restores the default). */
export function setIndicatorWorkerPoolFactory (factory: PoolFactory | null): void {
  dropPool()
  workersFailed = false
  poolFactory = factory ?? defaultPoolFactory
}

/**
 * Configure off-main-thread calculation of the built-in MA, EMA, RSI and BOLL
 * indicators for large series. Applies to every chart on the page.
 */
export function configureIndicatorWorkers (options: IndicatorWorkerOptions): void {
  const before = config.maxWorkers
  if (options.enabled !== undefined) config.enabled = options.enabled
  if (options.minBars !== undefined && options.minBars >= 0) config.minBars = Math.floor(options.minBars)
  if (options.maxWorkers !== undefined && options.maxWorkers >= 1) config.maxWorkers = Math.floor(options.maxWorkers)
  if (!config.enabled || config.maxWorkers !== before) dropPool()
}

function dropPool (): void {
  const current = pool
  pool = null
  void current?.then(p => { p?.destroy() })
}

function poolSize (): number {
  if (config.maxWorkers >= 1) return config.maxWorkers
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined
  return Math.min(typeof cores === 'number' && cores > 0 ? cores : 2, 4)
}

async function getPool (): Promise<IndicatorWorkerPool | null> {
  if (workersFailed) return null
  pool ??= poolFactory(poolSize()).catch(() => null)
  const p = await pool
  return p?.alive === true ? p : null
}

function outputKeys (kind: IndicatorKind, indicator: Indicator, outputs: number): string[] | null {
  if (kind === 'BOLL') return ['up', 'mid', 'dn']
  const keys = indicator.figures.slice(0, outputs).map(figure => figure.key)
  return keys.length === outputs ? keys : null
}

function toRow (kernel: Kernel, keys: string[], values: ArrayLike<number>, i: number): Row {
  const row: Row = {}
  for (let s = 0; s < kernel.outputs; s++) {
    if (i >= kernel.firstIndex(s)) row[keys[s]] = values[s]
  }
  return row
}

function signature (dataList: CandleData[]): string {
  const n = dataList.length
  if (n === 0) return '0'
  const last = dataList[Math.max(0, n - 2)]
  return `${n}|${dataList[0].timestamp}|${dataList[0].close}|${last.timestamp}|${last.close}`
}

/** Same array, same params, bars only ticked or appended since the snapshot. */
function canStepFrom (snap: Snapshot, dataList: CandleData[], paramsKey: string): boolean {
  return snap.dataList === dataList &&
    snap.paramsKey === paramsKey &&
    snap.n >= 2 &&
    dataList.length >= snap.n &&
    dataList[0].timestamp === snap.firstTimestamp &&
    dataList[snap.n - 2].timestamp === snap.checkTimestamp
}

function stepFrom (kernel: Kernel, snap: Snapshot, dataList: CandleData[], keys: string[]): Row[] {
  const n = dataList.length
  const close = (i: number): number => dataList[i].close
  const out = new Array<number>(kernel.outputs)
  let state = snap.state.slice()
  let stateBeforeLast = state
  for (let i = snap.n - 1; i < n; i++) {
    if (i === n - 1) stateBeforeLast = state.slice()
    out.fill(NaN)
    kernel.step(state, close, i, out)
    snap.rows[i] = toRow(kernel, keys, out, i)
  }
  state = stateBeforeLast
  snap.n = n
  snap.state = state
  snap.checkTimestamp = dataList[n - 2].timestamp
  return snap.rows
}

async function fullRun (kind: IndicatorKind, params: number[], kernel: Kernel, dataList: CandleData[]): Promise<KernelRun> {
  const n = dataList.length
  const workers = await getPool()
  if (workers !== null) {
    const closes = new Float64Array(n)
    for (let i = 0; i < n; i++) closes[i] = dataList[i].close
    try {
      return await workers.run(kind, params, closes)
    } catch {
      workersFailed = true
      dropPool()
    }
  }
  return runKernel(kernel, i => dataList[i].close, n)
}

/** Result of the newest full run, following any run that starts while waiting. */
async function newest (tracker: Tracker): Promise<Row[]> {
  let current = tracker.latest!
  let rows = await current
  while (current !== tracker.latest) {
    current = tracker.latest!
    rows = await current
  }
  return rows
}

async function accelerated (
  kind: IndicatorKind, dataList: CandleData[], indicator: Indicator, params: number[], keys: string[], kernel: Kernel
): Promise<Row[]> {
  let tracker = trackers.get(indicator)
  if (tracker === undefined) {
    tracker = { snapshot: null, seq: 0, latest: null, pending: null, pendingData: null }
    trackers.set(indicator, tracker)
  }
  // A tick or new bar on the data a full run is computing steps from that run's
  // state, so wait for it. A full run for other data doesn't wait: it supersedes.
  if (tracker.pending !== null && tracker.pendingData === dataList) {
    const seqBefore = tracker.seq
    await tracker.pending.catch(() => undefined)
    // Newer data arrived while we waited; this call's data is already stale.
    if (tracker.seq !== seqBefore) return await newest(tracker)
  }

  const paramsKey = JSON.stringify(params)
  const snap = tracker.snapshot
  if (snap !== null && canStepFrom(snap, dataList, paramsKey)) {
    return stepFrom(kernel, snap, dataList, keys)
  }

  const n = dataList.length
  if (snap === null || snap.paramsKey !== paramsKey || signature(snap.dataList) !== signature(dataList)) {
    indicator.result = []
  }
  const seq = ++tracker.seq
  const firstTimestamp = dataList[0].timestamp
  const checkTimestamp = dataList[Math.max(0, n - 2)].timestamp
  const job = fullRun(kind, params, kernel, dataList).then(run => {
    const rows = new Array<Row>(n)
    const values = new Array<number>(kernel.outputs)
    for (let i = 0; i < n; i++) {
      for (let s = 0; s < kernel.outputs; s++) values[s] = run.outputs[s][i]
      rows[i] = toRow(kernel, keys, values, i)
    }
    if (seq === tracker.seq && run.stateBeforeLast !== null) {
      tracker.snapshot = { dataList, paramsKey, n, state: run.stateBeforeLast, firstTimestamp, checkTimestamp, rows }
    }
    return rows
  })
  tracker.pending = job
  tracker.pendingData = dataList
  tracker.latest = job
  try {
    const rows = await job
    // A newer full run started meanwhile: never let this older result land last.
    return seq === tracker.seq ? rows : await newest(tracker)
  } finally {
    if (tracker.pending === job) {
      tracker.pending = null
      tracker.pendingData = null
    }
  }
}

/** Wrap a built-in template so large series use the accelerated path when enabled. */
export function withWorkerOffload<D, C, E> (template: IndicatorTemplate<D, C, E>, kind: IndicatorKind): IndicatorTemplate<D, C, E> {
  const original = template.calc
  return {
    ...template,
    calc: (dataList, indicator) => {
      const params = indicator.calcParams as unknown[]
      if (config.enabled && dataList.length >= Math.max(2, config.minBars) && validParams(kind, params)) {
        const kernel = createKernel(kind, params)
        const keys = outputKeys(kind, indicator as unknown as Indicator, kernel.outputs)
        if (keys !== null) {
          return accelerated(kind, dataList, indicator as unknown as Indicator, params, keys, kernel) as unknown as Promise<D[]>
        }
      }
      trackers.delete(indicator)
      return original(dataList, indicator)
    }
  }
}
