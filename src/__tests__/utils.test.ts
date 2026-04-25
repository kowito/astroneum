import { describe, it, expect } from 'vitest'
import { deepSet, deepClone } from '../utils'

describe('deepSet', () => {
  it('sets a top-level key', () => {
    const obj: Record<string, unknown> = {}
    deepSet(obj, 'a', 1)
    expect(obj.a).toBe(1)
  })

  it('sets a nested key, creating intermediate objects', () => {
    const obj: Record<string, unknown> = {}
    deepSet(obj, 'a.b.c', 42)
    expect((obj as any).a.b.c).toBe(42)
  })

  it('overwrites an existing value', () => {
    const obj = { a: { b: 1 } }
    deepSet(obj, 'a.b', 99)
    expect(obj.a.b).toBe(99)
  })
})

describe('deepClone', () => {
  it('clones a primitive', () => {
    expect(deepClone(5)).toBe(5)
    expect(deepClone('hello')).toBe('hello')
    expect(deepClone(null)).toBeNull()
  })

  it('clones an array deeply', () => {
    const arr = [1, [2, 3]]
    const clone = deepClone(arr)
    expect(clone).toEqual(arr)
    expect(clone).not.toBe(arr)
    expect(clone[1]).not.toBe(arr[1])
  })

  it('clones an object deeply', () => {
    const obj = { a: { b: 1 } }
    const clone = deepClone(obj)
    expect(clone).toEqual(obj)
    expect(clone.a).not.toBe(obj.a)
  })
})
