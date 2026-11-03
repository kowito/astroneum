import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isTakingSnapshot, takeSnapshot } from '../engine/common/snapshot'

describe('snapshot', () => {
  it('is on only while the callback runs, also when it throws or nests', () => {
    assert.equal(isTakingSnapshot(), false)
    const inside = takeSnapshot(() => takeSnapshot(() => isTakingSnapshot()) && isTakingSnapshot())
    assert.equal(inside, true)
    assert.equal(isTakingSnapshot(), false)
    assert.throws(() => takeSnapshot(() => { throw new Error('draw failed') }))
    assert.equal(isTakingSnapshot(), false)
  })
})
