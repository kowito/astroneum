import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { getDefaultStyles } from '../engine/common/Styles'
import dark from '../engine/extension/styles/dark'
import light from '../engine/extension/styles/light'
import { opaqueColor } from '../engine/common/utils/color'
import type { CandleData } from '../types'

/** Every leaf path of a nested style object, like 'crosshair.horizontal.line.color'. */
function leafPaths (value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [prefix]
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => leafPaths(child, prefix === '' ? key : `${prefix}.${key}`))
}

const bar = (open: number, close: number, timestamp = 0): CandleData => ({ timestamp, open, high: Math.max(open, close) + 1, low: Math.min(open, close) - 1, close })

describe('chart themes', () => {
  it('dark and light set the same keys, so switching themes leaves nothing behind', () => {
    // setStyles('light') merges over the dark styles; a key only dark sets would survive the switch.
    assert.deepEqual(leafPaths(dark).sort(), leafPaths(light).sort())
  })

  it('the candle legend shows OHLC in the bar colour and the signed change in the change colour', () => {
    const styles = getDefaultStyles().candle
    const template = styles.tooltip.legend.template
    assert.equal(typeof template, 'function')
    if (typeof template !== 'function') return
    const up = template({ prev: bar(100, 100), current: bar(100, 102), next: null }, styles)
    assert.deepEqual(up.map(l => l.title), ['open', 'high', 'low', 'close', ''])
    for (const legend of up.slice(0, 4)) assert.deepEqual(legend.value, { text: (legend.value as { text: string }).text, color: styles.bar.upColor })
    assert.deepEqual(up[4].value, { text: '+2.00%', color: styles.priceMark.last.upColor })

    const down = template({ prev: bar(100, 100), current: bar(101, 99), next: null }, styles)
    assert.equal((down[0].value as { color: string }).color, styles.bar.downColor)
    assert.deepEqual(down[4].value, { text: '-1.00%', color: styles.priceMark.last.downColor })

    const first = template({ prev: null, current: bar(100, 101), next: null }, styles)
    assert.equal(first.length, 4, 'no change entry without a previous bar')
  })
})

describe('opaqueColor', () => {
  it('drops the alpha of rgba colours and leaves others alone', () => {
    assert.equal(opaqueColor('rgba(8, 153, 129, 0.5)'), 'rgba(8, 153, 129, 1)')
    assert.equal(opaqueColor('rgba(8,153,129,.25)'), 'rgba(8, 153, 129, 1)')
    assert.equal(opaqueColor('#089981'), '#089981')
    assert.equal(opaqueColor('rgb(1, 2, 3)'), 'rgb(1, 2, 3)')
  })
})
