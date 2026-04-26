/**
 * BarsCodec — P4-B: FlatBuffers-style binary bar codec.
 *
 * Wire format
 * ───────────
 * Each message is a self-describing binary frame:
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  4 bytes │ magic "BARS" (0x42415253)                     │
 *   │  4 bytes │ version (u32 LE) = 1                          │
 *   │  4 bytes │ bar count (u32 LE)                            │
 *   │  N × 40  │ bar records (see below)                       │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Bar record layout (40 bytes, all little-endian):
 *   offset  0 │  8 bytes │ timestamp (i64 LE, milliseconds since epoch)
 *   offset  8 │  8 bytes │ open     (f64 LE)
 *   offset 16 │  8 bytes │ high     (f64 LE)
 *   offset 24 │  8 bytes │ low      (f64 LE)
 *   offset 32 │  8 bytes │ close    (f64 LE)
 *
 * Note: volume/turnover are omitted from v1 to minimise wire bytes for
 * the common chart rendering case.  A v2 extension with optional fields
 * is planned.
 *
 * Alignment
 * ─────────
 * All records are 8-byte aligned; the frame header is exactly 12 bytes.
 * When decoded, a 4-byte pad is inserted after the header so bar records
 * start at offset 16 (aligned for DataView 8-byte operations without
 * explicit alignment checks).
 */

import type { CandleData } from '@/types'

const MAGIC     = 0x42415253   // 'B','A','R','S'
const VERSION   = 1
const HDR_SIZE  = 12   // magic(4) + version(4) + count(4)
const BAR_SIZE  = 40   // timestamp(8) + o(8) + h(8) + l(8) + c(8)
const PAD_TO_16 = 4    // pad header to 16 for 8-byte alignment of first bar

export class BarsCodec {
  /**
   * Encode an array of `CandleData` into a compact binary frame.
   *
   * @param bars  Source bar array.
   * @returns     Uint8Array ready to transmit.
   */
  static encode (bars: ReadonlyArray<CandleData>): Uint8Array {
    const n    = bars.length
    const size = HDR_SIZE + PAD_TO_16 + n * BAR_SIZE
    const buf  = new ArrayBuffer(size)
    const view = new DataView(buf)

    view.setUint32(0, MAGIC,    true)
    view.setUint32(4, VERSION,  true)
    view.setUint32(8, n,        true)
    // 4-byte pad (bytes 12–15) left as zero

    for (let i = 0; i < n; i++) {
      const off = 16 + i * BAR_SIZE
      const bar = bars[i]
      // timestamp as i64: BigInt avoids precision loss for 64-bit int.
      // We split into two 32-bit words because DataView.setBigInt64 is not
      // available in all targets.
      const ts = bar.timestamp
      const tsLo = ts >>> 0
      const tsHi = Math.floor(ts / 0x100000000) >>> 0
      view.setUint32(off,     tsLo, true)
      view.setUint32(off + 4, tsHi, true)

      view.setFloat64(off +  8, bar.open,  true)
      view.setFloat64(off + 16, bar.high,  true)
      view.setFloat64(off + 24, bar.low,   true)
      view.setFloat64(off + 32, bar.close, true)
    }

    return new Uint8Array(buf)
  }

  /**
   * Decode a binary frame back into `CandleData[]`.
   *
   * @param data  Received bytes.
   * @returns     Decoded bar array (empty on invalid magic/version).
   */
  static decode (data: Uint8Array): CandleData[] {
    if (data.byteLength < HDR_SIZE) return []
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

    const magic   = view.getUint32(0, true)
    const version = view.getUint32(4, true)
    const n       = view.getUint32(8, true)

    if (magic !== MAGIC || version !== VERSION) return []
    if (data.byteLength < 16 + n * BAR_SIZE) return []

    const bars: CandleData[] = new Array(n)
    for (let i = 0; i < n; i++) {
      const off  = 16 + i * BAR_SIZE
      const tsLo = view.getUint32(off,     true)
      const tsHi = view.getUint32(off + 4, true)
      const timestamp = tsLo + tsHi * 0x100000000

      bars[i] = {
        timestamp,
        open:  view.getFloat64(off +  8, true),
        high:  view.getFloat64(off + 16, true),
        low:   view.getFloat64(off + 24, true),
        close: view.getFloat64(off + 32, true)
      }
    }
    return bars
  }
}
