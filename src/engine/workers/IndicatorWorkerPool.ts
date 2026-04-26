/**
 * IndicatorWorker — off-main-thread indicator calculation worker.
 *
 * P1-B: Spawns from a Blob URL so no import path is needed at runtime.
 * Receives serialised OHLCV data as a Float64Array column store via
 * structured clone (SharedArrayBuffer upgrade: see IndicatorWorkerPool).
 *
 * Protocol:
 *   → { type: 'calc', id, cols, n, period, kind }
 *   ← { type: 'result', id, data: Float64Array[] }
 *   ← { type: 'error',  id, message: string }
 */

// ── Worker source ─────────────────────────────────────────────────────────

function _buildWorkerSrc (): string {
  return /* javascript */ `
'use strict';

// Reusable EMA helper
function emaStep(period, src, out) {
  const n = src.length;
  out.fill(NaN);
  if (period <= 0 || period > n) return out;
  const k = 2 / (period + 1), km1 = 1 - k;
  let seed = 0;
  for (let i = 0; i < period; i++) seed += src[i];
  seed /= period;
  out[period - 1] = seed;
  for (let i = period; i < n; i++) out[i] = src[i] * k + out[i - 1] * km1;
  return out;
}

function smaStep(period, src, out) {
  const n = src.length;
  out.fill(NaN);
  if (period <= 0 || period > n) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += src[i];
  out[period - 1] = sum / period;
  for (let i = period; i < n; i++) { sum += src[i] - src[i - period]; out[i] = sum / period; }
  return out;
}

self.onmessage = function(evt) {
  const msg = evt.data;
  try {
    const { id, cols, n, period, kind } = msg;
    // Reconstruct column views from the received Float64Array column store.
    const closeCol = new Float64Array(cols.buffer, cols.byteOffset + n * 3 * 8, n); // COL_CLOSE = 3
    const out1 = new Float64Array(n);
    let result;

    switch (kind) {
      case 'sma':
        result = [smaStep(period, closeCol, out1)];
        break;
      case 'ema':
        result = [emaStep(period, closeCol, out1)];
        break;
      case 'rsi': {
        out1.fill(NaN);
        if (period > 0 && period + 1 <= n) {
          let avgGain = 0, avgLoss = 0;
          for (let i = 1; i <= period; i++) {
            const d = closeCol[i] - closeCol[i - 1];
            if (d > 0) avgGain += d; else avgLoss -= d;
          }
          avgGain /= period; avgLoss /= period;
          out1[period] = avgLoss === 0 ? 100 : (100 - 100 / (1 + avgGain / avgLoss));
          const inv = 1 / period, pm1 = period - 1;
          for (let i = period + 1; i < n; i++) {
            const d = closeCol[i] - closeCol[i - 1];
            avgGain = (avgGain * pm1 + (d > 0 ? d : 0)) * inv;
            avgLoss = (avgLoss * pm1 + (d < 0 ? -d : 0)) * inv;
            out1[i] = avgLoss === 0 ? 100 : (100 - 100 / (1 + avgGain / avgLoss));
          }
        }
        result = [out1];
        break;
      }
      default:
        result = [];
    }
    self.postMessage({ type: 'result', id, data: result });
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: String(err) });
  }
};
`
}

// ── IndicatorWorkerPool ────────────────────────────────────────────────────

export type IndicatorKind = 'sma' | 'ema' | 'rsi'

export interface IndicatorWorkerRequest {
  kind: IndicatorKind
  period: number
  /** Packed column store from WasmIndicators.packBars() */
  cols: Float64Array
  n: number
}

export interface IndicatorWorkerResult {
  data: Float64Array[]
}

interface PendingRequest {
  resolve: (r: IndicatorWorkerResult) => void
  reject: (e: Error) => void
}

/**
 * P1-B: Pool of indicator calculation workers.
 *
 * Maintains N concurrent workers (default: `navigator.hardwareConcurrency`
 * capped at 4).  Requests are round-robin dispatched; each worker handles
 * one in-flight request at a time.  The pool is created lazily on first use
 * and destroyed when the chart unmounts via `IndicatorWorkerPool.destroy()`.
 */
export class IndicatorWorkerPool {
  private readonly _workers: Worker[]
  private readonly _pending = new Map<string, PendingRequest>()
  private _nextWorker = 0
  private _seq = 0

  constructor (size?: number) {
    const n = Math.min(size ?? (navigator.hardwareConcurrency ?? 2), 4)
    const src  = _buildWorkerSrc()
    const blob = new Blob([src], { type: 'application/javascript' })
    const url  = URL.createObjectURL(blob)
    this._workers = Array.from({ length: n }, () => {
      const w = new Worker(url)
      w.onmessage = (e: MessageEvent) => this._onMessage(e)
      w.onerror   = (e: ErrorEvent)   => this._onError(e)
      return w
    })
    URL.revokeObjectURL(url)
  }

  /**
   * Submit an indicator calculation and receive the result as a Promise.
   * The `cols` Float64Array is structured-cloned to the worker (no SAB needed
   * for compatibility — the array is already compact and usually < 400 KB).
   */
  run (req: IndicatorWorkerRequest): Promise<IndicatorWorkerResult> {
    return new Promise<IndicatorWorkerResult>((resolve, reject) => {
      const id = String(this._seq++)
      this._pending.set(id, { resolve, reject })
      const worker = this._workers[this._nextWorker % this._workers.length]
      this._nextWorker++
      worker.postMessage({ type: 'calc', id, cols: req.cols, n: req.n, period: req.period, kind: req.kind })
    })
  }

  destroy (): void {
    for (const w of this._workers) w.terminate()
    this._pending.clear()
  }

  private _onMessage (e: MessageEvent): void {
    const { type, id, data, message } = e.data as { type: string; id: string; data?: Float64Array[]; message?: string }
    const pending = this._pending.get(id)
    if (pending === undefined) return
    this._pending.delete(id)
    if (type === 'result') {
      pending.resolve({ data: data ?? [] })
    } else {
      pending.reject(new Error(message ?? 'IndicatorWorker error'))
    }
  }

  private _onError (e: ErrorEvent): void {
    // Reject all pending requests when a worker crashes
    this._pending.forEach(p => p.reject(new Error(e.message)))
    this._pending.clear()
  }
}
