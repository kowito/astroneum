// The GPU indicator renderers read instance buffers with a fixed stride. These
// tests pin the byte layout the vertex attribute pointers expect, which is
// what went wrong before: segments were packed 20 bytes apart but read 24
// bytes apart, so every segment after the first drew between unrelated points.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  InstanceStaging,
  packRect,
  packSegment,
  RECT_BYTES,
  RECT_COLOR_OFFSET,
  SEGMENT_BYTES,
  SEGMENT_COLOR_OFFSET
} from '../engine/common/instancePacking.js'
import { isGpuRectEligible } from '../engine/common/IndicatorRectWebGLRenderer.js'

const RED: readonly [number, number, number, number] = [1, 0, 0, 1]
const HALF_BLUE: readonly [number, number, number, number] = [0, 0, 1, 0.5]

function floatAt (staging: InstanceStaging, byteOffset: number): number {
  return new DataView(staging.buffer).getFloat32(byteOffset, true)
}

describe('instance packing', () => {
  it('packs each segment at a 24-byte stride with its colour at byte 20', () => {
    const staging = new InstanceStaging(SEGMENT_BYTES, 2)
    packSegment(staging, 1, 2, 3, 4, 0.5, RED)
    packSegment(staging, 5, 6, 7, 8, 1.5, HALF_BLUE)
    packSegment(staging, 9, 10, 11, 12, 2.5, RED)   // forces growth
    assert.equal(staging.count, 3)
    for (let i = 0; i < 3; i++) {
      const base = i * SEGMENT_BYTES
      assert.deepEqual(
        [0, 4, 8, 12, 16].map(offset => floatAt(staging, base + offset)),
        [1 + 4 * i, 2 + 4 * i, 3 + 4 * i, 4 + 4 * i, 0.5 + i]
      )
    }
    // Colour bytes sit right after the five floats of their own segment.
    const u8 = staging.u8
    assert.deepEqual([...u8.subarray(SEGMENT_COLOR_OFFSET, SEGMENT_COLOR_OFFSET + 4)], [255, 0, 0, 255])
    assert.deepEqual([...u8.subarray(SEGMENT_BYTES + SEGMENT_COLOR_OFFSET, SEGMENT_BYTES + SEGMENT_COLOR_OFFSET + 4)], [0, 0, 255, 128])
    assert.equal(staging.bytes().byteLength, 3 * SEGMENT_BYTES)
  })

  it('packs each rect at a 20-byte stride with its colour at byte 16', () => {
    const staging = new InstanceStaging(RECT_BYTES, 1)
    packRect(staging, 10, 20, 3, 40, RED)
    packRect(staging, 11, 21, 4, 41, HALF_BLUE)
    assert.equal(staging.count, 2)
    assert.deepEqual([0, 4, 8, 12].map(o => floatAt(staging, o)), [10, 20, 3, 40])
    assert.deepEqual([0, 4, 8, 12].map(o => floatAt(staging, RECT_BYTES + o)), [11, 21, 4, 41])
    assert.deepEqual([...staging.u8.subarray(RECT_COLOR_OFFSET, RECT_COLOR_OFFSET + 4)], [255, 0, 0, 255])
    assert.deepEqual([...staging.u8.subarray(RECT_BYTES + RECT_COLOR_OFFSET, RECT_BYTES + RECT_COLOR_OFFSET + 4)], [0, 0, 255, 128])
  })

  it('keeps packed data when the buffer grows', () => {
    const staging = new InstanceStaging(RECT_BYTES, 1)
    for (let i = 0; i < 100; i++) packRect(staging, i, i * 2, 1, 1, RED)
    assert.ok(staging.capacity >= 100)
    assert.equal(floatAt(staging, 57 * RECT_BYTES), 57)
    assert.equal(floatAt(staging, 57 * RECT_BYTES + 4), 114)
  })

  it('hashes the contents so an unchanged frame skips the upload and any change does not', () => {
    const pack = (x: number, color = RED): InstanceStaging => {
      const staging = new InstanceStaging(SEGMENT_BYTES, 4)
      packSegment(staging, x, 1, 2, 3, 0.5, color)
      packSegment(staging, 4, 5, 6, 7, 0.5, color)
      return staging
    }
    assert.equal(pack(1).hash, pack(1).hash)
    assert.notEqual(pack(1).hash, pack(1.01).hash)
    assert.notEqual(pack(1).hash, pack(1, HALF_BLUE).hash)
    const staging = pack(1)
    const hash = staging.hash
    staging.reset()
    assert.equal(staging.count, 0)
    packSegment(staging, 1, 1, 2, 3, 0.5, RED)
    packSegment(staging, 4, 5, 6, 7, 0.5, RED)
    assert.equal(staging.hash, hash)
  })

  it('sends plain solid fills to the GPU and everything the figure strokes or shades to Canvas2D', () => {
    assert.equal(isGpuRectEligible({ style: 'fill', color: '#ff0000', borderSize: 1, borderColor: '#000' }), true)
    assert.equal(isGpuRectEligible({ color: 'rgba(0,0,0,0.5)' }), true)
    assert.equal(isGpuRectEligible({ style: 'stroke_fill', color: '#ff0000' }), false)
    assert.equal(isGpuRectEligible({ style: 'stroke', color: '#ff0000' }), false)
    assert.equal(isGpuRectEligible({ style: 'fill', color: { gradient: true } }), false)
    assert.equal(isGpuRectEligible({ style: 'fill', color: 'transparent' }), false)
    assert.equal(isGpuRectEligible({ style: 'fill', color: '#ff0000', borderRadius: 4 }), false)
  })
})
