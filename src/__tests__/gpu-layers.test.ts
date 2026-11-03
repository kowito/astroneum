import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isTakingSnapshot, takeSnapshot } from '../engine/common/snapshot'
import { isLinearYAxis } from '../engine/component/YAxis'
import type { AxisRange, AxisTemplate } from '../engine/component/Axis'
import normal from '../engine/extension/y-axis/normal'
import percentage from '../engine/extension/y-axis/percentage'
import logarithm from '../engine/extension/y-axis/logarithm'
import { getYAxisClass } from '../engine/extension/y-axis/index'
import { getOptions, isAxisSetting } from '../widget/setting-modal/data'

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

describe('price axis on the GPU candle path', () => {
  // A BTC-like range: 77,500 to 77,900, shown as -0.2% to +0.3% on a percentage axis.
  const range = (realFrom: number, realTo: number): AxisRange => ({
    from: 77_500, to: 77_900, range: 400, realFrom, realTo, realRange: realTo - realFrom, displayFrom: realFrom, displayTo: realTo, displayRange: realTo - realFrom
  })
  const axis = (template: AxisTemplate, r: AxisRange) => ({
    getRange: () => r,
    valueToRealValue: template.valueToRealValue ?? ((value: number) => value)
  })

  it('treats normal and percentage axes as linear, so the shaders can draw them', () => {
    assert.equal(isLinearYAxis(axis(normal, range(77_500, 77_900))), true)
    assert.equal(isLinearYAxis(axis(percentage, range(-0.2, 0.3))), true)
  })

  it('sends a log axis to Canvas2D, even over a narrow price range', () => {
    assert.equal(isLinearYAxis(axis(logarithm, range(Math.log10(77_500), Math.log10(77_900)))), false)
  })
})

describe('settings dialog', () => {
  const options = getOptions('en-US')

  it('offers only price axis types that are registered', () => {
    const axisType = options.find(option => option.key === 'axis.name')
    assert.ok(axisType?.dataSource)
    for (const { key } of axisType.dataSource) {
      // getYAxisClass falls back to normal for an unknown name
      assert.ok(key === 'normal' || getYAxisClass(key) !== getYAxisClass('normal'), `${key} is not a y-axis`)
    }
  })

  it('keeps the axis rows apart from the style rows', () => {
    assert.deepEqual(options.filter(option => isAxisSetting(option.key)).map(option => option.key), ['axis.name', 'axis.reverse'])
  })
})
