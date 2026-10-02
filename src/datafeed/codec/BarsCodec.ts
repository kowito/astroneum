/**
 * BarsCodec — compact binary encoding for a series of bars.
 *
 * Used by the OPFS history cache (`HistoryCache`) and the WebTransport
 * datafeed, where it is also the wire format.
 *
 * Frame layout (all little-endian)
 * ────────────────────────────────
 *    0  u32  magic "BARS" (0x42415253)
 *    4  u32  version = 2
 *    8  u32  bar count N
 *   12  u32  reserved (0) — keeps the bar records 8-byte aligned
 *   16  N × 56-byte records:
 *         +0   f64  timestamp (ms since epoch; f64 also covers pre-1970)
 *         +8   f64  open
 *         +16  f64  high
 *         +24  f64  low
 *         +32  f64  close
 *         +40  f64  volume    (NaN = absent)
 *         +48  f64  turnover  (NaN = absent)
 *
 * A frame is self-delimiting: `frameLength()` reads the header of a byte
 * stream and returns the total size of the frame that starts there.
 */

import type { CandleData } from '@/types'

const MAGIC = 0x42415253 // 'B','A','R','S'
const VERSION = 2
const HEADER_SIZE = 16
const BAR_SIZE = 56
// ~28 MB — guards against crafted or corrupt input allocating unbounded memory.
const MAX_BARS = 500_000

export class BarsCodec {
  static readonly HEADER_SIZE = HEADER_SIZE
  static readonly BAR_SIZE = BAR_SIZE
  static readonly MAX_BARS = MAX_BARS

  /** Encode bars into a single frame. */
  static encode (bars: ReadonlyArray<CandleData>): Uint8Array<ArrayBuffer> {
    const n = bars.length
    if (n > MAX_BARS) {
      throw new RangeError(`[BarsCodec] ${n} bars exceeds the ${MAX_BARS}-bar frame limit`)
    }
    const buf = new ArrayBuffer(HEADER_SIZE + n * BAR_SIZE)
    const view = new DataView(buf)
    view.setUint32(0, MAGIC, true)
    view.setUint32(4, VERSION, true)
    view.setUint32(8, n, true)
    for (let i = 0; i < n; i++) {
      const bar = bars[i]
      const off = HEADER_SIZE + i * BAR_SIZE
      view.setFloat64(off, bar.timestamp, true)
      view.setFloat64(off + 8, bar.open, true)
      view.setFloat64(off + 16, bar.high, true)
      view.setFloat64(off + 24, bar.low, true)
      view.setFloat64(off + 32, bar.close, true)
      view.setFloat64(off + 40, bar.volume ?? NaN, true)
      view.setFloat64(off + 48, bar.turnover ?? NaN, true)
    }
    return new Uint8Array(buf)
  }

  /**
   * Size in bytes of the frame starting at `data[0]`, or `null` when fewer
   * than `HEADER_SIZE` bytes are available or the header is not a valid
   * BarsCodec header.
   */
  static frameLength (data: Uint8Array): number | null {
    if (data.byteLength < HEADER_SIZE) return null
    const view = new DataView(data.buffer, data.byteOffset, HEADER_SIZE)
    if (view.getUint32(0, true) !== MAGIC || view.getUint32(4, true) !== VERSION) return null
    const n = view.getUint32(8, true)
    if (n > MAX_BARS) return null
    return HEADER_SIZE + n * BAR_SIZE
  }

  /**
   * Decode exactly one frame. Returns `[]` for anything that is not a complete,
   * well-formed frame (wrong magic/version, truncated or trailing bytes,
   * non-finite timestamp or price).
   */
  static decode (data: Uint8Array): CandleData[] {
    const length = BarsCodec.frameLength(data)
    if (length === null || data.byteLength !== length) return []
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    const n = view.getUint32(8, true)
    const bars: CandleData[] = new Array(n)
    for (let i = 0; i < n; i++) {
      const off = HEADER_SIZE + i * BAR_SIZE
      const timestamp = view.getFloat64(off, true)
      const open = view.getFloat64(off + 8, true)
      const high = view.getFloat64(off + 16, true)
      const low = view.getFloat64(off + 24, true)
      const close = view.getFloat64(off + 32, true)
      if (!Number.isFinite(timestamp) || !Number.isFinite(open) || !Number.isFinite(high) ||
        !Number.isFinite(low) || !Number.isFinite(close)) {
        return []
      }
      const bar: CandleData = { timestamp, open, high, low, close }
      const volume = view.getFloat64(off + 40, true)
      const turnover = view.getFloat64(off + 48, true)
      if (!Number.isNaN(volume)) bar.volume = volume
      if (!Number.isNaN(turnover)) bar.turnover = turnover
      bars[i] = bar
    }
    return bars
  }
}
