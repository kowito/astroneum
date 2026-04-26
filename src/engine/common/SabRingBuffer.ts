/**
 * SabRingBuffer — P3-C: SharedArrayBuffer-backed ring buffer for streaming
 * bar data.
 *
 * Architecture
 * ────────────
 * Provides a lock-free single-producer / single-consumer ring buffer backed
 * by a SharedArrayBuffer.  The producer (main thread or datafeed worker)
 * writes packed bar records; the consumer (indicator worker pool) reads them
 * via Atomics.wait / Atomics.notify without any structured-clone overhead.
 *
 * Wire layout
 * ───────────
 * The SharedArrayBuffer is divided into two regions:
 *
 *   Bytes 0–7:   control region (2 × i32):
 *                  [0] head index  (producer advances)
 *                  [4] tail index  (consumer advances)
 *
 *   Bytes 8–end: data region (capacity × BAR_STRIDE bytes)
 *
 * BAR_STRIDE = 40 bytes:  timestamp(8) + open(8) + high(8) + low(8) + close(8)
 *
 * Usage
 * ─────
 *   const buf = SabRingBuffer.create(4096)   // 4096-bar ring
 *   buf.push({ timestamp, open, high, low, close })   // producer
 *   const bar = buf.pop()                             // consumer (returns null when empty)
 *
 * Graceful degradation
 * ────────────────────
 * When SharedArrayBuffer is unavailable, `SabRingBuffer.create()` returns a
 * plain-array fallback implementation that shares the same API.
 */

import type { CandleData } from '../common/Data'

const BAR_STRIDE   = 40  // bytes per bar record
const CTRL_BYTES   = 8   // head + tail i32 counters
const HEAD_OFFSET  = 0   // i32 index of head counter
const TAIL_OFFSET  = 1   // i32 index of tail counter

// ── Data read/write helpers ───────────────────────────────────────────────

function _writeBar (view: DataView, byteOffset: number, bar: CandleData): void {
  // Split i64 timestamp into two u32 words (LE)
  const ts = bar.timestamp
  view.setUint32(byteOffset,     ts >>> 0, true)
  view.setUint32(byteOffset + 4, Math.floor(ts / 0x100000000) >>> 0, true)
  view.setFloat64(byteOffset +  8, bar.open,  true)
  view.setFloat64(byteOffset + 16, bar.high,  true)
  view.setFloat64(byteOffset + 24, bar.low,   true)
  view.setFloat64(byteOffset + 32, bar.close, true)
}

function _readBar (view: DataView, byteOffset: number): CandleData {
  const tsLo = view.getUint32(byteOffset,     true)
  const tsHi = view.getUint32(byteOffset + 4, true)
  return {
    timestamp: tsLo + tsHi * 0x100000000,
    open:  view.getFloat64(byteOffset +  8, true),
    high:  view.getFloat64(byteOffset + 16, true),
    low:   view.getFloat64(byteOffset + 24, true),
    close: view.getFloat64(byteOffset + 32, true)
  }
}

// ── SAB-backed implementation ─────────────────────────────────────────────

export class SabRingBuffer {
  private readonly _ctrl: Int32Array   // view over control region
  private readonly _data: DataView     // view over data region
  private readonly _capacity: number   // slot count

  private constructor (sab: SharedArrayBuffer, capacity: number) {
    this._ctrl     = new Int32Array(sab, 0, 2)
    this._data     = new DataView(sab, CTRL_BYTES)
    this._capacity = capacity
  }

  /**
   * Create a new ring buffer with the given capacity (number of bars).
   *
   * When SharedArrayBuffer is available and the page is cross-origin-isolated,
   * returns a `SabRingBuffer`.  Otherwise returns a `FallbackRingBuffer` with
   * an identical API.
   */
  static create (capacity: number): SabRingBuffer | FallbackRingBuffer {
    const isolated = (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true
    if (typeof SharedArrayBuffer !== 'undefined' && isolated) {
      const byteLen = CTRL_BYTES + capacity * BAR_STRIDE
      return new SabRingBuffer(new SharedArrayBuffer(byteLen), capacity)
    }
    return new FallbackRingBuffer(capacity)
  }

  /** Producer: append a bar.  Returns false when the ring is full. */
  push (bar: CandleData): boolean {
    const head = Atomics.load(this._ctrl, HEAD_OFFSET)
    const tail = Atomics.load(this._ctrl, TAIL_OFFSET)
    if (head - tail >= this._capacity) return false   // full

    const slot = head % this._capacity
    _writeBar(this._data, slot * BAR_STRIDE, bar)
    Atomics.store(this._ctrl, HEAD_OFFSET, head + 1)
    Atomics.notify(this._ctrl, HEAD_OFFSET, 1)
    return true
  }

  /** Consumer: read and remove the oldest bar.  Returns null when empty. */
  pop (): CandleData | null {
    const tail = Atomics.load(this._ctrl, TAIL_OFFSET)
    const head = Atomics.load(this._ctrl, HEAD_OFFSET)
    if (tail >= head) return null   // empty

    const slot = tail % this._capacity
    const bar  = _readBar(this._data, slot * BAR_STRIDE)
    Atomics.store(this._ctrl, TAIL_OFFSET, tail + 1)
    return bar
  }

  /** Available bars to read. */
  get size (): number {
    return Atomics.load(this._ctrl, HEAD_OFFSET) - Atomics.load(this._ctrl, TAIL_OFFSET)
  }

  /** Maximum bar capacity. */
  get capacity (): number { return this._capacity }
}

// ── Plain-array fallback ──────────────────────────────────────────────────

export class FallbackRingBuffer {
  private readonly _buf: CandleData[]
  private _head = 0
  private _tail = 0
  private readonly _capacity: number

  constructor (capacity: number) {
    this._capacity = capacity
    this._buf = new Array(capacity)
  }

  push (bar: CandleData): boolean {
    if (this._head - this._tail >= this._capacity) return false
    this._buf[this._head % this._capacity] = { ...bar }
    this._head++
    return true
  }

  pop (): CandleData | null {
    if (this._tail >= this._head) return null
    const bar = this._buf[this._tail % this._capacity]
    this._tail++
    return bar
  }

  get size (): number { return this._head - this._tail }
  get capacity (): number { return this._capacity }
}
