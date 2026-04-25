/**
 * RingBuffer<T> — fixed-capacity circular buffer with O(1) append, prepend, and index access.
 *
 * Purpose: streaming time-series data (candles, ticks) that grows at the tail
 * and drops the oldest bar at the head when capacity is exceeded.
 * Avoids the O(n) cost of Array.splice() during live streaming.
 *
 * Capacity design: set to your desired visible bar count × 2–4× for history.
 * At 1 tick/second and 4h of data: 14_400 bars → use capacity = 32_768.
 *
 * @example
 * const bars = new RingBuffer<CandleData>(8192)
 * bars.push(tick)                // O(1) — auto-drops oldest when full
 * const last = bars.last()       // O(1)
 * const bar  = bars.at(-1)       // O(1) — negative index from tail
 * bars.updateLast(merged)        // O(1) — in-place last bar update
 */
export class RingBuffer<T> {
  private readonly _buf: Array<T | undefined>
  private readonly _capacity: number
  /** Index of the oldest item (logical position 0). */
  private _head = 0
  /** Total items ever written — from this we derive the current fill and tail. */
  private _size = 0

  constructor(capacity: number) {
    if (capacity < 1) throw new RangeError('[RingBuffer] capacity must be ≥ 1')
    this._capacity = capacity
    this._buf = new Array<T | undefined>(capacity).fill(undefined)
  }

  // ─── Size ────────────────────────────────────────────────────────────────

  get length(): number { return Math.min(this._size, this._capacity) }
  get capacity(): number { return this._capacity }
  get isFull(): boolean { return this._size >= this._capacity }

  // ─── Write ───────────────────────────────────────────────────────────────

  /**
   * Append an item to the tail.
   * When full, silently overwrites (and advances) the oldest item.
   */
  push(item: T): void {
    const slot = (this._head + Math.min(this._size, this._capacity - 1) + (this.isFull ? 1 : 0)) % this._capacity
    if (this.isFull) {
      this._buf[slot] = item
      this._head = (this._head + 1) % this._capacity
    } else {
      this._buf[(this._head + this._size) % this._capacity] = item
      this._size++
    }
  }

  /**
   * Replace the last item in-place.
   * Used to update the current live bar with a new tick merge result.
   * O(1) — no allocation.
   */
  updateLast(item: T): void {
    if (this._size === 0) { this.push(item); return }
    const slot = (this._head + Math.min(this._size, this._capacity) - 1) % this._capacity
    this._buf[slot] = item
  }

  // ─── Read ────────────────────────────────────────────────────────────────

  /**
   * Access item at logical index.
   * Positive: 0 = oldest, `length - 1` = newest.
   * Negative: -1 = newest, -length = oldest.
   * Returns `undefined` when out of bounds.
   */
  at(index: number): T | undefined {
    const len = this.length
    if (len === 0) return undefined
    const i = index < 0 ? len + index : index
    if (i < 0 || i >= len) return undefined
    return this._buf[(this._head + i) % this._capacity]
  }

  /** Most recently pushed item. O(1). */
  last(): T | undefined { return this.at(-1) }

  /** Oldest item still in the buffer. O(1). */
  first(): T | undefined { return this.at(0) }

  // ─── Iteration ───────────────────────────────────────────────────────────

  /**
   * Iterate from oldest to newest without allocating a copy.
   * Uses a standard iterator protocol so it works with `for…of`.
   */
  [Symbol.iterator](): Iterator<T> {
    const len = this.length
    let i = 0
    return {
      next: (): IteratorResult<T> => {
        if (i >= len) return { value: undefined as unknown as T, done: true }
        return { value: this.at(i++)!, done: false }
      }
    }
  }

  /**
   * Return a dense snapshot copy as a plain array, oldest → newest.
   * O(n). Use sparingly — this allocates. Prefer `at()` / iteration.
   */
  toArray(): T[] {
    const out: T[] = new Array(this.length)
    for (let i = 0; i < this.length; i++) {
      out[i] = this.at(i)!
    }
    return out
  }

  // ─── Maintenance ─────────────────────────────────────────────────────────

  clear(): void {
    this._buf.fill(undefined)
    this._head = 0
    this._size = 0
  }
}
