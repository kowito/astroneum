import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import closeLine from '../engine/extension/indicator/closeLine'
import { getIndicatorClass, getSupportedIndicators } from '../engine/extension/indicator/index'
import type { CandleData } from '../types'

const CANDLES: CandleData[] = [
  { timestamp: 1, open: 10, high: 13, low: 9, close: 12, volume: 100 },
  { timestamp: 2, open: 12, high: 15, low: 11, close: 14, volume: 120 },
  { timestamp: 3, open: 14, high: 16, low: 13, close: 15.5, volume: 110 }
]

describe('LINE indicator', () => {
  it('plots the close of every bar', () => {
    const rows = closeLine.calc(CANDLES, {} as never) as Array<{ close?: number }>
    assert.deepEqual(rows.map(row => row.close), [12, 14, 15.5])
  })

  it('follows a live tick that rewrites the last bar', () => {
    const live = CANDLES.map(candle => ({ ...candle }))
    live[live.length - 1].close = 16.25
    const rows = closeLine.calc(live, {} as never) as Array<{ close?: number }>
    assert.equal(rows[rows.length - 1].close, 16.25)
  })

  it('is a price-series line figure and is registered', () => {
    assert.equal(closeLine.series, 'price')
    assert.deepEqual(closeLine.figures?.map(f => [f.key, f.type]), [['close', 'line']])
    assert.ok(getSupportedIndicators().includes('LINE'))
    assert.notEqual(getIndicatorClass('LINE'), null)
  })
})
