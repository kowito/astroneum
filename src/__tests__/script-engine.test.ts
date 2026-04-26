import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { getIndicatorClass } from '../engine/extension/indicator/index'
import ScriptEngine from '../scripting/ScriptEngine'

describe('ScriptEngine', () => {
  it('auto-registers compiled indicators', () => {
    const name = `UNIT_SCRIPT_PLUGIN_${Date.now()}`
    const engine = ScriptEngine.getInstance()
    const template = engine.compile(`
      study('${name}', { overlay: true })
      plot(close, { title: 'Close' })
    `, name)

    assert.equal(template.name, name)
    assert.notEqual(getIndicatorClass(name), null)
  })
})
