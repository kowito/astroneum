/**
 * Indicator worker. Not imported by the library: scripts/gen-indicator-worker.mjs
 * bundles this file (with TypedArrayIndicators) into indicatorWorkerSource.generated.ts,
 * which IndicatorWorkerPool starts from a Blob URL.
 *
 * Protocol
 *   → { id, kind, params, closes: Float64Array }            (closes transferred)
 *   ← { id, outputs: Float64Array[], stateBeforeLast }       (outputs transferred)
 *   ← { id, error: string }
 */

import { createKernel, runKernel, type IndicatorKind } from './TypedArrayIndicators'

interface Job {
  id: number
  kind: IndicatorKind
  params: number[]
  closes: Float64Array
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Job>) => void) | null
  postMessage: (message: unknown, transfer?: Transferable[]) => void
}

scope.onmessage = (event) => {
  const { id, kind, params, closes } = event.data
  try {
    const run = runKernel(createKernel(kind, params), i => closes[i], closes.length)
    scope.postMessage({ id, outputs: run.outputs, stateBeforeLast: run.stateBeforeLast }, run.outputs.map(o => o.buffer))
  } catch (e) {
    scope.postMessage({ id, error: String(e) })
  }
}
