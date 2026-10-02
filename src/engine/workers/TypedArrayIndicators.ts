/**
 * TypedArrayIndicators — step kernels for the built-in MA, EMA, RSI and BOLL
 * indicators, used by the indicator worker pool and its main-thread fast paths.
 *
 * Each kernel mirrors its engine template (extension/indicator/*.ts) operation
 * for operation, so results are bit-identical to the template's `calc` — the
 * parity tests compare them with `deepStrictEqual`.
 *
 * A kernel is a step function over a small numeric state: running it over all
 * bars produces the full result, and keeping the state from just before the
 * last bar lets a tick (last close changed) or a new bar be recomputed by
 * stepping one or a few bars instead of the whole series. The state is a plain
 * `number[]` so it can cross `postMessage`.
 */

export type IndicatorKind = 'MA' | 'EMA' | 'RSI' | 'BOLL'

/** Close price of bar `i`; bars before 0 are never requested. */
export type CloseAt = (i: number) => number

export interface Kernel {
  /** Number of output series. */
  outputs: number
  /** First bar index at which output series `s` has a value (earlier rows omit the key). */
  firstIndex: (s: number) => number
  init: () => number[]
  /** Advance `state` past bar `i`, writing that bar's output values into `out`. */
  step: (state: number[], close: CloseAt, i: number, out: number[]) => void
}

/** Periods must be positive integers; BOLL's second param is any finite multiplier. */
export function validParams (kind: IndicatorKind, params: readonly unknown[]): params is number[] {
  const isPeriod = (v: unknown): boolean => typeof v === 'number' && Number.isInteger(v) && v > 0
  if (kind === 'BOLL') {
    return params.length === 2 && isPeriod(params[0]) && typeof params[1] === 'number' && Number.isFinite(params[1])
  }
  return params.length > 0 && params.every(isPeriod)
}

// movingAverage.ts: closeSums[index] += close; ma = sum / p; sum -= close[i - (p - 1)]
function maKernel (periods: number[]): Kernel {
  return {
    outputs: periods.length,
    firstIndex: s => periods[s] - 1,
    init: () => periods.map(() => 0),
    step: (state, close, i, out) => {
      const c = close(i)
      for (let s = 0; s < periods.length; s++) {
        const p = periods[s]
        state[s] += c
        if (i >= p - 1) {
          out[s] = state[s] / p
          state[s] -= close(i - (p - 1))
        }
      }
    }
  }
}

// exponentialMovingAverage.ts: one running close sum seeds each EMA at p - 1,
// then ema = (2 * close + (p - 1) * prev) / (p + 1).
// state: [closeSum, prev_0, prev_1, ...]
function emaKernel (periods: number[]): Kernel {
  return {
    outputs: periods.length,
    firstIndex: s => periods[s] - 1,
    init: () => [0, ...periods.map(() => 0)],
    step: (state, close, i, out) => {
      const c = close(i)
      state[0] += c
      for (let s = 0; s < periods.length; s++) {
        const p = periods[s]
        if (i >= p - 1) {
          state[s + 1] = i > p - 1 ? (2 * c + (p - 1) * state[s + 1]) / (p + 1) : state[0] / p
          out[s] = state[s + 1]
        }
      }
    }
  }
}

// relativeStrengthIndex.ts: rolling sums of gains (A) and losses (B) over p deltas,
// delta[0] = 0. The template's A starts `undefined` until the first gain, which
// makes the value NaN (key present) while B > 0; a zero B gives 0.
// state per period: [A, A is set (0/1), B]
function rsiKernel (periods: number[]): Kernel {
  const delta = (close: CloseAt, i: number): number => close(i) - (i > 0 ? close(i - 1) : close(i))
  return {
    outputs: periods.length,
    firstIndex: s => periods[s] - 1,
    init: () => periods.flatMap(() => [0, 0, 0]),
    step: (state, close, i, out) => {
      const d = delta(close, i)
      for (let s = 0; s < periods.length; s++) {
        const p = periods[s]
        const o = s * 3
        if (d > 0) {
          state[o] = (state[o + 1] === 1 ? state[o] : 0) + d
          state[o + 1] = 1
        } else {
          state[o + 2] = state[o + 2] + Math.abs(d)
        }
        if (i >= p - 1) {
          const a = state[o + 1] === 1 ? state[o] : NaN
          out[s] = state[o + 2] !== 0 ? 100 - (100.0 / (1 + a / state[o + 2])) : 0
          const startDelta = delta(close, i - (p - 1))
          if (startDelta > 0) {
            state[o] -= startDelta
          } else {
            state[o + 2] -= Math.abs(startDelta)
          }
        }
      }
    }
  }
}

// bollingerBands.ts: mid = running sum / P; md = population std over the
// window, computed two-pass; up/dn = mid ± k * md. Outputs: [up, mid, dn].
// state: [closeSum]
function bollKernel (period: number, multiplier: number): Kernel {
  const q = period - 1
  return {
    outputs: 3,
    firstIndex: () => q,
    init: () => [0],
    step: (state, close, i, out) => {
      state[0] += close(i)
      if (i >= q) {
        const mid = state[0] / period
        let sum = 0
        for (let j = i - q; j <= i; j++) {
          const closeMa = close(j) - mid
          sum += closeMa * closeMa
        }
        sum = Math.abs(sum)
        const md = Math.sqrt(sum / period)
        out[0] = mid + multiplier * md
        out[1] = mid
        out[2] = mid - multiplier * md
        state[0] -= close(i - q)
      }
    }
  }
}

export function createKernel (kind: IndicatorKind, params: number[]): Kernel {
  switch (kind) {
    case 'MA': return maKernel(params)
    case 'EMA': return emaKernel(params)
    case 'RSI': return rsiKernel(params)
    case 'BOLL': return bollKernel(params[0], params[1])
  }
}

export interface KernelRun {
  /** One array per output series; entries before `firstIndex(s)` are NaN and mean "no value". */
  outputs: Float64Array[]
  /** Kernel state just before the last bar (`null` when there are no bars). */
  stateBeforeLast: number[] | null
}

/** Run a kernel over `n` bars. */
export function runKernel (kernel: Kernel, close: CloseAt, n: number): KernelRun {
  const outputs = Array.from({ length: kernel.outputs }, () => new Float64Array(n).fill(NaN))
  const state = kernel.init()
  const out = new Array<number>(kernel.outputs)
  let stateBeforeLast: number[] | null = null
  for (let i = 0; i < n; i++) {
    if (i === n - 1) stateBeforeLast = state.slice()
    out.fill(NaN)
    kernel.step(state, close, i, out)
    for (let s = 0; s < kernel.outputs; s++) outputs[s][i] = out[s]
  }
  return { outputs, stateBeforeLast }
}
