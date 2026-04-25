import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { deepSet, deepClone } from '../utils'

describe('deepSet', () => {
  it('sets a top-level key', () => {
    const obj: Record<string, unknown> = {}
    deepSet(obj, 'a', 1)
    assert.equal(obj.a, 1)
  })

  it('sets a nested key, creating intermediate objects', () => {
    const obj: Record<string, unknown> = {}
    deepSet(obj, 'a.b.c', 42)
    assert.equal((obj as { a: { b: { c: number } } }).a.b.c, 42)
  })

  it('overwrites an existing value', () => {
    const obj = { a: { b: 1 } }
    deepSet(obj, 'a.b', 99)
    assert.equal(obj.a.b, 99)
  })
})

describe('deepClone', () => {
  it('clones a primitive', () => {
    assert.equal(deepClone(5), 5)
    assert.equal(deepClone('hello'), 'hello')
    assert.equal(deepClone(null), null)
  })

  it('clones an array deeply', () => {
    const arr = [1, [2, 3]]
    const clone = deepClone(arr)
    assert.deepEqual(clone, arr)
    assert.notStrictEqual(clone, arr)
    assert.notStrictEqual(clone[1], arr[1])
  })

  it('clones an object deeply', () => {
    const obj = { a: { b: 1 } }
    const clone = deepClone(obj)
    assert.deepEqual(clone, obj)
    assert.notStrictEqual(clone.a, obj.a)
  })
})
