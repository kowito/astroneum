/**
 * WasmIndicators — SIMD-style TypedArray indicator calculations.
 *
 * P3-A: Pure TypedArray implementation that avoids per-bar object allocation
 * on the indicator hot path.  All intermediate buffers are pre-allocated
 * Float64Arrays; the result is a single contiguous Float64Array that callers
 * can map back to their existing indicator result arrays.
 *
 * P3-B: The staging loop for packing OHLCV into a typed-array column store
 * is batched as a tight numeric loop over typed views, avoiding JS object
 * property lookups per bar.
 *
 * Design notes
 * ────────────
 * • No Rust / wasm-pack dependency — all optimisations are pure TypeScript.
 * • Input: `Float64Array` column store (see `packBars`).
 * • Output: `Float64Array` result buffers (one per output series).
 * • Graceful fallback: if the column store cannot be built (e.g., empty data),
 *   functions return empty arrays without throwing.
 */

// ── Column indices for the packed bar store ──────────────────────────────

export const COL_OPEN  = 0
export const COL_HIGH  = 1
export const COL_LOW   = 2
export const COL_CLOSE = 3
export const COL_VOL   = 4
export const NUM_COLS  = 5

// ── P3-B: Pack OHLCV objects into contiguous typed columns ───────────────

/**
 * Pack an array of `{open,high,low,close,volume?}` objects into a flat
 * `Float64Array` column store with layout:
 *
 *   [open[0], open[1], …, high[0], high[1], …, low[0], …, close[0], …, vol[0], …]
 *
 * This is the same layout used internally by most SIMD-friendly batch
 * indicator algorithms — it maximises cache-line utilisation for single-
 * column traversal (e.g., SMA traverses only the `close` column).
 *
 * @param data  Source bar array (any object with open/high/low/close fields)
 * @returns     A `ColumnStore` wrapping the packed buffer
 */
export function packBars (
  data: ReadonlyArray<{ open: number; high: number; low: number; close: number; volume?: number }>
): ColumnStore {
  const n = data.length
  const buf = new Float64Array(n * NUM_COLS)
  const openCol  = 0
  const highCol  = n
  const lowCol   = n * 2
  const closeCol = n * 3
  const volCol   = n * 4

  // P3-B: tight loop — only numeric ops, no property-bag overhead in hot path
  for (let i = 0; i < n; i++) {
    const d = data[i]
    buf[openCol  + i] = d.open
    buf[highCol  + i] = d.high
    buf[lowCol   + i] = d.low
    buf[closeCol + i] = d.close
    buf[volCol   + i] = d.volume ?? 0
  }
  return new ColumnStore(buf, n)
}

// ── Column store accessor ─────────────────────────────────────────────────

export class ColumnStore {
  constructor (
    public readonly buf: Float64Array,
    public readonly length: number
  ) {}

  col (colIdx: number): Float64Array {
    return this.buf.subarray(colIdx * this.length, (colIdx + 1) * this.length)
  }

  open  (): Float64Array { return this.col(COL_OPEN) }
  high  (): Float64Array { return this.col(COL_HIGH) }
  low   (): Float64Array { return this.col(COL_LOW)  }
  close (): Float64Array { return this.col(COL_CLOSE) }
  vol   (): Float64Array { return this.col(COL_VOL)  }
}

// ── Typed-Array SMA ──────────────────────────────────────────────────────

/**
 * Compute a Simple Moving Average over `src` using a sliding sum — O(N),
 * no per-element division in steady state (Kahan sum not needed for f64).
 *
 * @param src    Input values (e.g., `store.close()`)
 * @param period SMA window size
 * @param out    Output buffer; created if not supplied or wrong length
 */
export function sma (
  src: Float64Array,
  period: number,
  out?: Float64Array
): Float64Array {
  const n = src.length
  const result = (out !== undefined && out.length === n) ? out : new Float64Array(n)
  result.fill(NaN)
  if (period <= 0 || period > n) return result

  let sum = 0
  for (let i = 0; i < period; i++) sum += src[i]
  result[period - 1] = sum / period

  for (let i = period; i < n; i++) {
    sum += src[i] - src[i - period]
    result[i] = sum / period
  }
  return result
}

// ── Typed-Array EMA ──────────────────────────────────────────────────────

/**
 * Exponential Moving Average — O(N), single-pass, no allocation on hot path
 * when `out` is supplied.
 */
export function ema (
  src: Float64Array,
  period: number,
  out?: Float64Array
): Float64Array {
  const n = src.length
  const result = (out !== undefined && out.length === n) ? out : new Float64Array(n)
  result.fill(NaN)
  if (period <= 0 || period > n) return result

  const k = 2 / (period + 1)
  const km1 = 1 - k
  // Seed with SMA of first `period` values
  let seed = 0
  for (let i = 0; i < period; i++) seed += src[i]
  seed /= period
  result[period - 1] = seed
  for (let i = period; i < n; i++) {
    result[i] = src[i] * k + result[i - 1] * km1
  }
  return result
}

// ── Typed-Array RSI ──────────────────────────────────────────────────────

/**
 * Relative Strength Index — Wilder smoothing, O(N), no allocation when
 * output buffer is supplied.
 */
export function rsi (
  close: Float64Array,
  period: number,
  out?: Float64Array
): Float64Array {
  const n = close.length
  const result = (out !== undefined && out.length === n) ? out : new Float64Array(n)
  result.fill(NaN)
  if (period <= 0 || period + 1 > n) return result

  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const delta = close[i] - close[i - 1]
    if (delta > 0) avgGain += delta
    else avgLoss -= delta
  }
  avgGain /= period
  avgLoss /= period

  const firstRsi = avgLoss === 0 ? 100 : (100 - 100 / (1 + avgGain / avgLoss))
  result[period] = firstRsi

  const invPeriod = 1 / period
  const prevPeriod = period - 1

  for (let i = period + 1; i < n; i++) {
    const delta = close[i] - close[i - 1]
    const gain = delta > 0 ? delta : 0
    const loss = delta < 0 ? -delta : 0
    avgGain = (avgGain * prevPeriod + gain) * invPeriod
    avgLoss = (avgLoss * prevPeriod + loss) * invPeriod
    result[i] = avgLoss === 0 ? 100 : (100 - 100 / (1 + avgGain / avgLoss))
  }
  return result
}

// ── Typed-Array Bollinger Bands ───────────────────────────────────────────

export interface BollingerResult {
  upper: Float64Array
  middle: Float64Array
  lower: Float64Array
}

/**
 * Bollinger Bands — middle = SMA(period), upper/lower = middle ± mult×σ.
 * Uses a rolling variance formula (Welford-style) for O(N) computation.
 */
export function bollingerBands (
  src: Float64Array,
  period: number,
  mult = 2,
  out?: BollingerResult
): BollingerResult {
  const n = src.length
  const mid = (out?.middle !== undefined && out.middle.length === n) ? out.middle : new Float64Array(n)
  const upper = (out?.upper !== undefined && out.upper.length === n) ? out.upper : new Float64Array(n)
  const lower = (out?.lower !== undefined && out.lower.length === n) ? out.lower : new Float64Array(n)
  mid.fill(NaN); upper.fill(NaN); lower.fill(NaN)
  if (period <= 0 || period > n) return { upper, middle: mid, lower }

  let sum = 0
  let sumSq = 0
  for (let i = 0; i < period; i++) {
    sum += src[i]
    sumSq += src[i] * src[i]
  }
  const computeBand = (i: number): void => {
    const mean = sum / period
    const variance = sumSq / period - mean * mean
    const sigma = variance > 0 ? Math.sqrt(variance) : 0
    mid[i]   = mean
    upper[i] = mean + mult * sigma
    lower[i] = mean - mult * sigma
  }
  computeBand(period - 1)

  for (let i = period; i < n; i++) {
    sum   += src[i]     - src[i - period]
    sumSq += src[i] * src[i] - src[i - period] * src[i - period]
    computeBand(i)
  }
  return { upper, middle: mid, lower }
}
