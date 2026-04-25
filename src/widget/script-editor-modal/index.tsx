import { useState } from 'react'

import { type Component, Show } from '@/react-shared'

import { Modal, Button } from '@/component'
import i18n from '@/i18n'
import ScriptEngine from '@/scripting/ScriptEngine'

export interface ScriptEditorModalProps {
  locale: string
  /** Called with the compiled indicator name so caller can register + add it */
  onCompiled: (indicatorName: string) => void
  onClose: () => void
}

const PLACEHOLDER = `// Pine Script–inspired JavaScript indicator
// Available: ta.sma, ta.ema, ta.rsi, ta.macd, ta.bbands, …

study('My SMA', { overlay: true })

const len = input('Length', 20)

const smaLine = ta.sma(close, len)

plot(smaLine, { title: 'SMA' })
`

const ScriptEditorModal: Component<ScriptEditorModalProps> = props => {
  const [source, setSource] = useState(PLACEHOLDER)
  const [error, setError] = useState('')
  const [compiled, setCompiled] = useState('')
  const [running, setRunning] = useState(false)

  function compile (): void {
    setError('')
    setCompiled('')
    setRunning(true)
    try {
      const engine = ScriptEngine.getInstance()
      const tpl = engine.compile(source)
      setCompiled(tpl.name)
      setRunning(false)
    } catch (e) {
      setError((e as Error).message)
      setRunning(false)
    }
  }

  function apply (): void {
    if (!compiled) return
    props.onCompiled(compiled)
    props.onClose()
  }

  return (
    <Modal
      title={i18n('script_editor', props.locale)}
      width={600}
      onClose={props.onClose}>
      <div class="astroneum-script-editor">
        <div class="script-editor-hint">
          {i18n('script_editor_hint', props.locale)}
        </div>

        <textarea
          class="script-editor-textarea"
          spellcheck={false}
          value={source}
          onInput={e => { setSource((e.target).value); setCompiled(''); setError('') }}
          aria-label="Script source code"
          rows={18}/>

        <Show when={error}>
          <div class="script-editor-error" role="alert">
            {error}
          </div>
        </Show>

        <Show when={compiled}>
          <div class="script-editor-success" role="status">
            {i18n('script_compiled', props.locale)}: <strong>{compiled}</strong>
          </div>
        </Show>

        <div class="script-editor-actions">
          <Button onClick={compile} type="cancel">
            {running ? '…' : i18n('script_compile', props.locale)}
          </Button>
          <Button
            onClick={apply}
            type="confirm"
            class={compiled ? '' : 'script-apply-disabled'}>
            {i18n('script_apply', props.locale)}
          </Button>
        </div>

        <details class="script-editor-api-ref">
          <summary>{i18n('script_api_ref', props.locale)}</summary>
          <pre class="script-api-code">{`study(name, { overlay?, precision? })
input(title, default)
plot(values[], { title?, color?, lineWidth? })

// Arrays — one value per bar (indexed from oldest → newest)
// Built-in series: open[], high[], low[], close[], volume[]

ta.sma(src, len)
ta.ema(src, len)
ta.rma(src, len)
ta.wma(src, len)
ta.rsi(src, len)
ta.highest(src, len)
ta.lowest(src, len)
ta.stdev(src, len)
ta.bbands(src, len, mult=2)  → { upper[], middle[], lower[] }
ta.macd(src, fast, slow, sig) → { macd[], signal[], histogram[] }
ta.cross(a, b)       → boolean[]
ta.crossover(a, b)   → boolean[]
ta.crossunder(a, b)  → boolean[]`}</pre>
        </details>
      </div>
    </Modal>
  )
}

export default ScriptEditorModal
