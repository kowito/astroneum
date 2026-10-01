/**
 * HistoryCache — persists loaded history per (symbol, period) so a reload only
 * has to fetch the newest bars, and the chart can still show recent bars when
 * the datafeed is unreachable.
 *
 * Each series is one contiguous, sorted, de-duplicated run of bars stored as a
 * single `BarsCodec` frame, capped to the newest `maxBars` bars.
 *
 * Initial load of [from, to]
 *   - No usable cache (empty, or ends before `from`): fetch the window and
 *     replace the cache with it.
 *   - Otherwise re-fetch from a couple of bars before the newest cached bar (it
 *     may have still been forming, and some datafeeds treat `from` as
 *     exclusive). If a closed bar in that overlap no longer matches, the data
 *     was adjusted upstream: drop the cache and fetch the whole window.
 *   - An empty or failed tail fetch serves the cached window instead (offline).
 *
 * Older history ("forward" in the engine's terms) is anchored on the chart's
 * oldest bar: when the cache holds bars before it they are served without a
 * network call; when the anchor is the cache's oldest bar, fetched bars are
 * prepended.
 *
 * Only plain OHLCV + turnover bars are cached; a datafeed that attaches extra
 * fields bypasses the cache. Writes happen after the caller has its data and
 * never surface errors — the cache must not break loading.
 */

import type { CandleData, Period, SymbolInfo } from '@/types'

import { BarsCodec } from './codec/BarsCodec'
import { OPFSBarStore, type BarStore } from './BarStore'

export interface HistoryCacheOptions {
  /** Keeps caches of different datafeeds that share tickers apart. Default `'default'`. */
  namespace?: string
  /** Newest bars kept per series. Default 20 000. */
  maxBars?: number
}

export interface HistoryLoadRequest {
  type: 'init' | 'forward'
  symbol: SymbolInfo
  period: Period
  from: number
  to: number
  /** `forward` only: timestamp of the oldest bar the chart already holds. */
  anchor?: number
  /** `forward` only: number of older bars to serve from the cache. Default 500. */
  count?: number
  fetch: (from: number, to: number) => Promise<CandleData[]>
}

type PersistOp =
  | { kind: 'replace', bars: CandleData[] }
  // Each part is authoritative for its own time range and is merged in turn;
  // `fallback` is written instead when a part no longer connects to the stored series.
  | { kind: 'merge', parts: CandleData[][], fallback: CandleData[] }
  // Prepend older bars, but only if the cache still starts at `anchor`.
  | { kind: 'prepend', bars: CandleData[], anchor: number }
  | { kind: 'remove' }

interface Plan {
  result: CandleData[]
  persist?: PersistOp
}

const DEFAULT_NAMESPACE = 'default'
const DEFAULT_MAX_BARS = 20_000
const DEFAULT_FORWARD_COUNT = 500
const TAIL_OVERLAP = 2
const KNOWN_FIELDS = new Set(['timestamp', 'open', 'high', 'low', 'close', 'volume', 'turnover'])

function isCacheable (bars: CandleData[]): boolean {
  return bars.every(bar => Object.keys(bar).every(k => KNOWN_FIELDS.has(k)) && Number.isFinite(bar.timestamp))
}

/** Sorted by timestamp, one bar per timestamp (last occurrence wins). */
function normalize (bars: CandleData[]): CandleData[] {
  let sorted = true
  for (let i = 1; i < bars.length; i++) {
    if (bars[i - 1].timestamp >= bars[i].timestamp) { sorted = false; break }
  }
  if (sorted) return bars
  const byTime = new Map<number, CandleData>()
  bars.forEach(bar => byTime.set(bar.timestamp, bar))
  return [...byTime.values()].sort((a, b) => a.timestamp - b.timestamp)
}

/** `fresh` (sorted) replaces everything `base` (sorted) has inside fresh's time range. */
function merge (base: CandleData[], fresh: CandleData[]): CandleData[] {
  if (fresh.length === 0) return base
  const first = fresh[0].timestamp
  const last = fresh[fresh.length - 1].timestamp
  return [
    ...base.filter(bar => bar.timestamp < first),
    ...fresh,
    ...base.filter(bar => bar.timestamp > last)
  ]
}

function closeEnough (a: number | undefined, b: number | undefined): boolean {
  if (a === undefined || b === undefined) return a === b
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))
}

function sameBar (a: CandleData, b: CandleData): boolean {
  return closeEnough(a.open, b.open) && closeEnough(a.high, b.high) && closeEnough(a.low, b.low) &&
    closeEnough(a.close, b.close) && closeEnough(a.volume, b.volume)
}

/**
 * True when a bar that was already closed in the cache differs from `tail`
 * (both sorted). The newest cached bar is skipped: it may have been forming.
 */
function wasAdjusted (cached: CandleData[], tail: CandleData[]): boolean {
  const oldestCached = cached[0].timestamp
  const newestCached = cached[cached.length - 1].timestamp
  return tail.some(bar => {
    if (bar.timestamp < oldestCached || bar.timestamp >= newestCached) return false
    const idx = indexOfTimestamp(cached, bar.timestamp)
    return idx === -1 || !sameBar(cached[idx], bar)
  })
}

function indexOfTimestamp (bars: CandleData[], timestamp: number): number {
  let lo = 0
  let hi = bars.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const t = bars[mid].timestamp
    if (t === timestamp) return mid
    if (t < timestamp) lo = mid + 1
    else hi = mid - 1
  }
  return -1
}

function isQuotaError (e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'QuotaExceededError'
}

async function withWebLock (name: string, task: () => Promise<void>): Promise<void> {
  const locks = typeof navigator !== 'undefined'
    ? (navigator as { locks?: LockManager }).locks
    : undefined
  if (locks === undefined) {
    await task()
    return
  }
  await locks.request(name, task)
}

export class HistoryCache {
  private readonly _store: BarStore
  private readonly _namespace: string
  private readonly _maxBars: number
  private readonly _writeLocks = new Map<string, Promise<void>>()

  constructor (store: BarStore, options: HistoryCacheOptions = {}) {
    this._store = store
    this._namespace = options.namespace ?? DEFAULT_NAMESPACE
    this._maxBars = Math.max(1, Math.floor(options.maxBars ?? DEFAULT_MAX_BARS))
  }

  /** A cache on OPFS, or `null` where OPFS is unavailable or not writable. */
  static createDefault (options: HistoryCacheOptions = {}): HistoryCache | null {
    if (!OPFSBarStore.isSupported() || !OPFSBarStore.isWritable()) return null
    return new HistoryCache(new OPFSBarStore(), options)
  }

  key (symbol: SymbolInfo, period: Period): string {
    return `${this._namespace}/${symbol.exchange ?? ''}:${symbol.ticker}/${period.multiplier}${period.timespan}`
  }

  /** Load bars for the request, using and updating the cache. Rejects only if the datafeed does. */
  async load (req: HistoryLoadRequest): Promise<CandleData[]> {
    const key = this.key(req.symbol, req.period)
    const plan = req.type === 'init' ? await this._planInit(key, req) : await this._planForward(key, req)
    if (plan.persist !== undefined) {
      // Not awaited: the caller gets its bars first; persistence is best-effort.
      void this._persist(key, plan.persist)
    }
    return plan.result
  }

  /** Resolves once every queued write for `key` has finished (for tests). */
  async flush (key: string): Promise<void> {
    await (this._writeLocks.get(key) ?? Promise.resolve())
  }

  async read (key: string): Promise<CandleData[]> {
    const bytes = await this._store.read(key).catch(() => null)
    if (bytes === null) return []
    const bars = BarsCodec.decode(bytes)
    if (bars.length === 0 && bytes.byteLength > 0) {
      void this._store.remove(key).catch(() => undefined) // corrupt
    }
    return bars
  }

  private async _planInit (key: string, req: HistoryLoadRequest): Promise<Plan> {
    const cached = await this.read(key)
    const inWindow = (bars: CandleData[]): CandleData[] => bars.filter(bar => bar.timestamp >= req.from)

    if (cached.length === 0 || cached[cached.length - 1].timestamp < req.from) {
      const fresh = await req.fetch(req.from, req.to)
      if (!isCacheable(fresh)) {
        return { result: fresh, persist: cached.length > 0 ? { kind: 'remove' } : undefined }
      }
      const bars = normalize(fresh)
      return { result: bars, persist: bars.length > 0 ? { kind: 'replace', bars } : undefined }
    }

    const tailFrom = cached[Math.max(0, cached.length - 1 - TAIL_OVERLAP)].timestamp
    let rawTail: CandleData[]
    try {
      rawTail = await req.fetch(tailFrom, req.to)
    } catch {
      return { result: inWindow(cached) }
    }
    // An empty answer for a range we know has bars is a datafeed hiccup, not data.
    if (rawTail.length === 0) return { result: inWindow(cached) }

    if (!isCacheable(rawTail)) {
      return { result: await req.fetch(req.from, req.to), persist: { kind: 'remove' } }
    }
    const tail = normalize(rawTail)

    if (wasAdjusted(cached, tail)) {
      const bars = normalize(await req.fetch(req.from, req.to))
      return { result: bars, persist: bars.length > 0 ? { kind: 'replace', bars } : { kind: 'remove' } }
    }

    let merged = merge(cached, tail)
    let fetchedHead: CandleData[] = []
    if (cached[0].timestamp > req.from) {
      // The cache starts inside the window: fetch what is missing before it.
      try {
        const head = await req.fetch(req.from, cached[0].timestamp)
        if (isCacheable(head)) {
          fetchedHead = normalize(head)
          merged = merge(merged, fetchedHead)
        }
      } catch {
        // Show what we have; the missing head loads later as older history.
      }
    }
    return { result: inWindow(merged), persist: { kind: 'merge', parts: [fetchedHead, tail], fallback: merged } }
  }

  private async _planForward (key: string, req: HistoryLoadRequest): Promise<Plan> {
    const anchor = req.anchor
    const cached = await this.read(key)
    const idx = anchor === undefined ? -1 : indexOfTimestamp(cached, anchor)
    if (idx > 0) {
      const count = req.count ?? DEFAULT_FORWARD_COUNT
      return { result: cached.slice(Math.max(0, idx - count), idx) }
    }
    const fresh = await req.fetch(req.from, req.to)
    if (idx !== 0 || anchor === undefined || fresh.length === 0 || !isCacheable(fresh)) {
      return { result: fresh }
    }
    const bars = normalize(fresh)
    const older = bars.filter(bar => bar.timestamp < anchor)
    return {
      result: bars,
      persist: older.length > 0 ? { kind: 'prepend', bars: older, anchor } : undefined
    }
  }

  private async _persist (key: string, op: PersistOp): Promise<void> {
    const previous = this._writeLocks.get(key) ?? Promise.resolve()
    const run = async (): Promise<void> => {
      await withWebLock(`astroneum-history:${key}`, async () => {
        await this._apply(key, op)
      }).catch(() => undefined)
    }
    const next = previous.then(run, run)
    this._writeLocks.set(key, next)
    await next
    if (this._writeLocks.get(key) === next) this._writeLocks.delete(key)
  }

  private async _apply (key: string, op: PersistOp): Promise<void> {
    if (op.kind === 'remove') {
      await this._store.remove(key)
      return
    }
    let series: CandleData[]
    if (op.kind === 'replace') {
      series = op.bars
    } else {
      // Re-read under the lock: another chart or tab may have written since we planned.
      const current = await this.read(key)
      if (op.kind === 'prepend') {
        if (current.length === 0 || current[0].timestamp !== op.anchor) return
        series = merge(current, op.bars)
      } else {
        series = current
        for (const part of op.parts) {
          if (part.length === 0) continue
          const connects = series.length > 0 &&
            part[0].timestamp <= series[series.length - 1].timestamp &&
            part[part.length - 1].timestamp >= series[0].timestamp
          if (!connects) {
            series = op.fallback
            break
          }
          series = merge(series, part)
        }
      }
    }
    if (series.length === 0) return
    if (series.length > this._maxBars) series = series.slice(series.length - this._maxBars)
    await this._write(key, BarsCodec.encode(series))
  }

  private async _write (key: string, data: Uint8Array<ArrayBuffer>): Promise<void> {
    try {
      await this._store.write(key, data)
    } catch (e) {
      if (!isQuotaError(e)) return
      // Evict the older half of the other series (least recently written first), retry once.
      const others = (await this._store.list()).filter(entry => entry.key !== key)
      others.sort((a, b) => a.lastModified - b.lastModified)
      await Promise.all(others.slice(0, Math.ceil(others.length / 2)).map(async entry => { await this._store.remove(entry.key) }))
      await this._store.write(key, data).catch(() => undefined)
    }
  }
}

