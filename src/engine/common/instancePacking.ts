// ---------------------------------------------------------------------------
// Per-instance vertex layouts for the indicator GL renderers, and the packing
// of one instance into a staging buffer. Deliberately free of WebGL so the
// layouts can be unit-tested: a wrong stride here draws garbage on the GPU
// (segments between unrelated points, rects at random places) that only shows
// up on uploads, which made it look like a driver bug the first time round.
// ---------------------------------------------------------------------------

import { packColor } from './candleShaders'

/** One line segment: x0 y0 x1 y1 halfWidth as float32, then RGBA as 4 bytes. */
export const SEGMENT_BYTES = 24
export const SEGMENT_FLOATS = SEGMENT_BYTES / 4
export const SEGMENT_COLOR_OFFSET = 20

/** One rect: x y width height as float32, then RGBA as 4 bytes. */
export const RECT_BYTES = 20
export const RECT_FLOATS = RECT_BYTES / 4
export const RECT_COLOR_OFFSET = 16

const FNV_OFFSET_BASIS = 2166136261
const FNV_PRIME = 16777619
// Coordinates are hashed at 1/1024 px; finer differences cannot change a pixel.
const HASH_SCALE = 1024

export type Rgba = readonly [number, number, number, number]

/**
 * A growable CPU-side copy of an instance buffer, plus a hash of its contents.
 * Views are rebuilt only when the buffer grows, so a steady frame allocates nothing.
 */
export class InstanceStaging {
  readonly bytesPerInstance: number
  buffer: ArrayBuffer
  f32: Float32Array
  u8: Uint8Array
  capacity: number
  count = 0
  hash = FNV_OFFSET_BASIS

  constructor (bytesPerInstance: number, initialCapacity = 512) {
    this.bytesPerInstance = bytesPerInstance
    this.capacity = initialCapacity
    this.buffer = new ArrayBuffer(initialCapacity * bytesPerInstance)
    this.f32 = new Float32Array(this.buffer)
    this.u8 = new Uint8Array(this.buffer)
  }

  reset (): void {
    this.count = 0
    this.hash = FNV_OFFSET_BASIS
  }

  /** Make room for `count` instances, doubling so growth is amortised. */
  ensure (count: number): void {
    if (count <= this.capacity) return
    let capacity = this.capacity
    while (capacity < count) capacity *= 2
    const buffer = new ArrayBuffer(capacity * this.bytesPerInstance)
    const u8 = new Uint8Array(buffer)
    u8.set(this.u8)
    this.buffer = buffer
    this.u8 = u8
    this.f32 = new Float32Array(buffer)
    this.capacity = capacity
  }

  mix (value: number): void {
    this.hash = Math.imul(this.hash ^ value, FNV_PRIME) >>> 0
  }

  mixFloat (value: number): void {
    this.mix(Math.round(value * HASH_SCALE) | 0)
  }

  /** The bytes of the `count` packed instances, as a view (no copy). */
  bytes (): Uint8Array {
    return this.u8.subarray(0, this.count * this.bytesPerInstance)
  }
}

/** Append one line segment. Call `staging.reset()` once per frame first. */
export function packSegment (
  staging: InstanceStaging,
  x0: number, y0: number, x1: number, y1: number,
  halfWidth: number,
  rgba: Rgba
): void {
  const i = staging.count
  staging.ensure(i + 1)
  const f = i * SEGMENT_FLOATS
  const f32 = staging.f32
  f32[f] = x0
  f32[f + 1] = y0
  f32[f + 2] = x1
  f32[f + 3] = y1
  f32[f + 4] = halfWidth
  const b = i * SEGMENT_BYTES + SEGMENT_COLOR_OFFSET
  packColor(rgba, staging.u8, b)
  staging.mixFloat(x0)
  staging.mixFloat(y0)
  staging.mixFloat(x1)
  staging.mixFloat(y1)
  staging.mixFloat(halfWidth)
  staging.mix(colorWord(staging.u8, b))
  staging.count = i + 1
}

/** Append one filled rect. Call `staging.reset()` once per frame first. */
export function packRect (
  staging: InstanceStaging,
  x: number, y: number, width: number, height: number,
  rgba: Rgba
): void {
  const i = staging.count
  staging.ensure(i + 1)
  const f = i * RECT_FLOATS
  const f32 = staging.f32
  f32[f] = x
  f32[f + 1] = y
  f32[f + 2] = width
  f32[f + 3] = height
  const b = i * RECT_BYTES + RECT_COLOR_OFFSET
  packColor(rgba, staging.u8, b)
  staging.mixFloat(x)
  staging.mixFloat(y)
  staging.mixFloat(width)
  staging.mixFloat(height)
  staging.mix(colorWord(staging.u8, b))
  staging.count = i + 1
}

function colorWord (u8: Uint8Array, offset: number): number {
  return (u8[offset] << 24 | u8[offset + 1] << 16 | u8[offset + 2] << 8 | u8[offset + 3]) | 0
}
