/**
 * Acceleration for the built-in MA, EMA, RSI, BOLL, VOL and MACD indicators.
 *
 * These templates have step kernels (TypedArrayIndicators) that mirror their
 * `calc` operation for operation, so:
 *   - A tick (last bar changed) or newly appended bars are recomputed by
 *     stepping only those bars from the kernel state kept from the last run,
 *     O(period) per bar instead of O(bars). This always applies: a full
 *     recompute of every indicator on every tick was the largest per-tick cost
 *     in the chart, larger than all drawing.
 *   - A full recompute (new data, new params) runs in a Web Worker when
 *     `configureIndicatorWorkers({ enabled: true })` is set and the series has
 *     at least `minBars` bars; otherwise the kernel runs on the main thread,
 *     which costs the same as the template's own `calc`.
 * Results are identical to the template's `calc`. For parameters the kernels
 * don't support, the template's `calc` runs unchanged. If workers can't start
 * or fail, full runs stay on the main thread for the rest of the session.
 */

import type { CandleData } from '../common/Data'
import type { Indicator, IndicatorTemplate } from '../component/Indicator'

import type { IndicatorWorkerPool } from './IndicatorWorkerPool'
import { createKernel, runKernel, validParams, type CloseAt, type IndicatorKind, type Kernel, type KernelRun } from './TypedArrayIndicators'

export interface IndicatorWorkerOptions {
  /** Default `false`. */
  enabled?: boolean
  /** Smallest series (in bars) whose full runs go to a worker. Default 20 000. */
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
 * Configure off-main-thread full recomputes of the built-in MA, EMA, RSI, BOLL,
 * VOL and MACD indicators for large series. Applies to every chart on the page.
 * Ticks and new bars step on the main thread whether or not this is enabled.
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

function trackerFor (indicator: Indicator): Tracker {
  let tracker = trackers.get(indicator)
  if (tracker === undefined) {
    tracker = { snapshot: null, seq: 0, latest: null, pending: null, pendingData: null }
    trackers.set(indicator, tracker)
  }
  return tracker
}

function outputKeys (kind: IndicatorKind, indicator: Indicator, outputs: number): string[] | null {
  if (kind === 'BOLL') return ['up', 'mid', 'dn']
  const keys = indicator.figures.slice(0, outputs).map(figure => figure.key)
  return keys.length === outputs ? keys : null
}

/** The series a kernel runs over: volume for VOL, close for the rest. */
function seriesOf (kind: IndicatorKind, dataList: CandleData[]): CloseAt {
  return kind === 'VOL' ? i => dataList[i].volume ?? 0 : i => dataList[i].close
}

function toRow (kind: IndicatorKind, kernel: Kernel, keys: string[], values: ArrayLike<number>, dataList: CandleData[], i: number): Row {
  const row: Row = {}
  for (let s = 0; s < kernel.outputs; s++) {
    if (i >= kernel.firstIndex(s)) row[keys[s]] = values[s]
  }
  if (kind === 'VOL') {
    // volume.ts rows also carry the bar itself, for the bar figure and its colours.
    const bar = dataList[i]
    row.volume = bar.volume ?? 0
    row.open = bar.open
    row.close = bar.close
  }
  return row
}

function rowsOf (kind: IndicatorKind, kernel: Kernel, keys: string[], run: KernelRun, dataList: CandleData[]): Row[] {
  const n = dataList.length
  const rows = new Array<Row>(n)
  const values = new Array<number>(kernel.outputs)
  for (let i = 0; i < n; i++) {
    for (let s = 0; s < kernel.outputs; s++) values[s] = run.outputs[s][i]
    rows[i] = toRow(kind, kernel, keys, values, dataList, i)
  }
  return rows
}

function snapshotOf (dataList: CandleData[], paramsKey: string, run: KernelRun, rows: Row[]): Snapshot | null {
  const n = dataList.length
  if (run.stateBeforeLast === null) return null
  return {
    dataList,
    paramsKey,
    n,
    state: run.stateBeforeLast,
    firstTimestamp: dataList[0].timestamp,
    checkTimestamp: dataList[Math.max(0, n - 2)].timestamp,
    rows
  }
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

function stepFrom (kind: IndicatorKind, kernel: Kernel, snap: Snapshot, dataList: CandleData[], keys: string[]): Row[] {
  const n = dataList.length
  const series = seriesOf(kind, dataList)
  const out = new Array<number>(kernel.outputs)
  let state = snap.state.slice()
  let stateBeforeLast = state
  for (let i = snap.n - 1; i < n; i++) {
    if (i === n - 1) stateBeforeLast = state.slice()
    out.fill(NaN)
    kernel.step(state, series, i, out)
    snap.rows[i] = toRow(kind, kernel, keys, out, dataList, i)
  }
  state = stateBeforeLast
  snap.n = n
  snap.state = state
  snap.checkTimestamp = dataList[n - 2].timestamp
  return snap.rows
}

/**
 * Main-thread path, synchronous: step from the last run when only the tail
 * changed, otherwise run the kernel over the whole series and keep its state.
 */
function stepped (kind: IndicatorKind, dataList: CandleData[], indicator: Indicator, params: number[], keys: string[], kernel: Kernel): Row[] {
  const tracker = trackerFor(indicator)
  const paramsKey = JSON.stringify(params)
  const snap = tracker.snapshot
  if (snap !== null && canStepFrom(snap, dataList, paramsKey)) {
    return stepFrom(kind, kernel, snap, dataList, keys)
  }
  const run = runKernel(kernel, seriesOf(kind, dataList), dataList.length)
  const rows = rowsOf(kind, kernel, keys, run, dataList)
  // A worker run still in flight (workers were just disabled) is now stale.
  tracker.seq++
  tracker.snapshot = snapshotOf(dataList, paramsKey, run, rows)
  tracker.latest = Promise.resolve(rows)
  return rows
}

async function fullRun (kind: IndicatorKind, params: number[], kernel: Kernel, dataList: CandleData[]): Promise<KernelRun> {
  const n = dataList.length
  const series = seriesOf(kind, dataList)
  const workers = await getPool()
  if (workers !== null) {
    const values = new Float64Array(n)
    for (let i = 0; i < n; i++) values[i] = series(i)
    try {
      return await workers.run(kind, params, values)
    } catch {
      workersFailed = true
      dropPool()
    }
  }
  return runKernel(kernel, series, n)
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

/** Worker path: full runs off the main thread, ticks and new bars stepped here. */
async function accelerated (
  kind: IndicatorKind, dataList: CandleData[], indicator: Indicator, params: number[], keys: string[], kernel: Kernel
): Promise<Row[]> {
  const tracker = trackerFor(indicator)
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
    return stepFrom(kind, kernel, snap, dataList, keys)
  }

  if (snap === null || snap.paramsKey !== paramsKey || signature(snap.dataList) !== signature(dataList)) {
    indicator.result = []
  }
  const seq = ++tracker.seq
  const job = fullRun(kind, params, kernel, dataList).then(run => {
    const rows = rowsOf(kind, kernel, keys, run, dataList)
    if (seq === tracker.seq) tracker.snapshot = snapshotOf(dataList, paramsKey, run, rows)
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

/** Wrap a built-in template so its kernel handles ticks, and workers its full runs when enabled. */
export function withWorkerOffload<D, C, E> (template: IndicatorTemplate<D, C, E>, kind: IndicatorKind): IndicatorTemplate<D, C, E> {
  const original = template.calc
  return {
    ...template,
    calc: (dataList, indicator) => {
      const params = indicator.calcParams as unknown[]
      if (validParams(kind, params)) {
        const kernel = createKernel(kind, params)
        const keys = outputKeys(kind, indicator as unknown as Indicator, kernel.outputs)
        if (keys !== null) {
          const useWorkers = config.enabled && dataList.length >= Math.max(2, config.minBars)
          return (useWorkers
            ? accelerated(kind, dataList, indicator as unknown as Indicator, params, keys, kernel)
            : stepped(kind, dataList, indicator as unknown as Indicator, params, keys, kernel)) as unknown as D[]
        }
      }
      trackers.delete(indicator)
      return original(dataList, indicator)
    }
  }
}
