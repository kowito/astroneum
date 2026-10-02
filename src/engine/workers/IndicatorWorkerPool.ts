/**
 * IndicatorWorkerPool — runs indicator kernels in Web Workers started from a
 * Blob URL (source: indicatorWorkerSource.generated.ts).
 *
 * Every request settles: if a worker cannot start (e.g. a CSP without `blob:`
 * in `worker-src`), errors, or does not answer within the timeout, the pool
 * marks itself dead and rejects everything pending; later requests reject at
 * once. Callers fall back to computing on the main thread.
 */

import workerSource from './indicatorWorkerSource.generated'
import type { IndicatorKind } from './TypedArrayIndicators'

export interface IndicatorJobResult {
  outputs: Float64Array[]
  stateBeforeLast: number[] | null
}

interface Pending {
  resolve: (result: IndicatorJobResult) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
  worker: number
}

interface WorkerReply {
  id: number
  outputs?: Float64Array[]
  stateBeforeLast?: number[] | null
  error?: string
}

const DEFAULT_TIMEOUT_MS = 10_000

export class IndicatorWorkerPool {
  private readonly _workers: Worker[] = []
  private readonly _inFlight: number[] = []
  private readonly _pending = new Map<number, Pending>()
  private readonly _timeoutMs: number
  private _url: string | null = null
  private _seq = 0
  private _dead = false

  constructor (size: number, timeoutMs = DEFAULT_TIMEOUT_MS) {
    this._timeoutMs = timeoutMs
    try {
      // Kept for the pool's lifetime: revoking right after `new Worker()` races
      // the script fetch in some browsers.
      this._url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }))
      for (let i = 0; i < Math.max(1, size); i++) {
        const worker = new Worker(this._url)
        worker.onmessage = (event: MessageEvent<WorkerReply>) => { this._onReply(event.data) }
        worker.onerror = (event: ErrorEvent) => {
          event.preventDefault()
          this._fail(new Error(event.message !== '' ? event.message : 'indicator worker failed'))
        }
        worker.onmessageerror = () => { this._fail(new Error('indicator worker sent an unreadable message')) }
        this._workers.push(worker)
        this._inFlight.push(0)
      }
    } catch (e) {
      this._fail(e instanceof Error ? e : new Error(String(e)))
    }
  }

  get alive (): boolean {
    return !this._dead
  }

  /** Compute `kind` over `closes`. The array's buffer is transferred to the worker. */
  async run (kind: IndicatorKind, params: number[], closes: Float64Array): Promise<IndicatorJobResult> {
    if (this._dead) throw new Error('indicator worker pool is unavailable')
    return await new Promise<IndicatorJobResult>((resolve, reject) => {
      const id = ++this._seq
      let worker = 0
      for (let i = 1; i < this._workers.length; i++) {
        if (this._inFlight[i] < this._inFlight[worker]) worker = i
      }
      const timer = setTimeout(() => { this._fail(new Error('indicator worker timed out')) }, this._timeoutMs)
      this._pending.set(id, { resolve, reject, timer, worker })
      this._inFlight[worker]++
      try {
        this._workers[worker].postMessage({ id, kind, params, closes }, [closes.buffer])
      } catch (e) {
        this._fail(e instanceof Error ? e : new Error(String(e)))
      }
    })
  }

  destroy (): void {
    this._fail(new Error('indicator worker pool destroyed'))
  }

  private _onReply (reply: WorkerReply): void {
    const pending = this._pending.get(reply.id)
    if (pending === undefined) return
    this._pending.delete(reply.id)
    clearTimeout(pending.timer)
    this._inFlight[pending.worker]--
    if (reply.error !== undefined || reply.outputs === undefined) {
      pending.reject(new Error(reply.error ?? 'indicator worker returned no data'))
    } else {
      pending.resolve({ outputs: reply.outputs, stateBeforeLast: reply.stateBeforeLast ?? null })
    }
  }

  private _fail (error: Error): void {
    if (this._dead) return
    this._dead = true
    this._pending.forEach(pending => {
      clearTimeout(pending.timer)
      pending.reject(error)
    })
    this._pending.clear()
    this._workers.forEach(worker => { worker.terminate() })
    this._workers.length = 0
    if (this._url !== null) {
      URL.revokeObjectURL(this._url)
      this._url = null
    }
  }
}
