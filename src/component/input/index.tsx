import { useState } from 'react'

import { type JSX, type Component, mergeProps, Show } from '@/react-shared'

export interface InputProps {
  class?: string
  style?: JSX.CSSProperties
  prefix?: JSX.Element
  suffix?: JSX.Element
  precision?: number
  min?: number
  max?: number
  placeholder?: string
  value: string | number
  disabled?: boolean
  onChange?: (value: string | number) => void 
}

const Input: Component<InputProps> = p => {
  const props = mergeProps({ min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER }, p)
  let input: HTMLInputElement

  const [status, setStatus] = useState('normal')

  return (
    <div
      style={props.style}
      class={`astroneum-input control ${props.prefix ? 'has-icons-left' : ''} ${props.suffix ? 'has-icons-right' : ''} ${props.class ?? ''}`}
      data-status={status}
      onClick={() => { input?.focus() }}>
      <input
        ref={(el) => { input = el }}
        class="input is-small"
        placeholder={props.placeholder ?? ''}
        value={props.value}
        onFocus={() => { setStatus('focus') }}
        onBlur={() => { setStatus('normal') }}
        onChange={(changeEvent) => {
          const inputValue = (changeEvent.target).value
          if ('precision' in props) {
            let validationRegex
            const decimalDigit = Math.max(0, Math.floor(props.precision!))
            if (decimalDigit <= 0) {
              validationRegex = new RegExp(/^[1-9]\d*$/)
            } else {
              validationRegex = new RegExp('^\\d+\\.?\\d{0,' + decimalDigit + '}$')
            }
            if (inputValue === '' || (validationRegex.test(inputValue) && +inputValue >= props.min && +inputValue <= props.max)) {
              props.onChange?.(inputValue === '' ? inputValue : +inputValue)
            }
          } else {
            props.onChange?.(inputValue)
          }
        }}/>
      <Show when={props.prefix}>
        <span class="icon is-small is-left">{props.prefix}</span>
      </Show>
      <Show when={props.suffix}>
        <span class="icon is-small is-right">{props.suffix}</span>
      </Show>
    </div>
  )
}

export default Input
