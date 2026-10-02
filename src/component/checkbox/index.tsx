import { useEffect, useState } from 'react'

import { type Component, type JSX } from '@/react-shared'


const CheckedIcon = () => {
  return (
    <svg
      viewBox="0 0 1024 1024"
      className="icon">
      <path
        d="M810.67 128H213.33c-46.93 0-85.33 38.4-85.33 85.33v597.33c0 46.93 38.4 85.33 85.33 85.33h597.33c46.93 0 85.33-38.4 85.33-85.33V213.33c0-46.93-38.4-85.33-85.33-85.33z m-353.71 567.04a42.5 42.5 0 0 1-60.16 0L243.63 541.87c-8.11-8.11-12.37-18.77-12.37-29.87s4.69-22.19 12.37-29.87a42.5 42.5 0 0 1 60.16 0L426.67 604.59l293.55-293.55a42.5 42.5 0 1 1 60.16 60.16l-323.41 323.84z"/>
    </svg>
  )
}

const NormalIcon = () => {
  return (
    <svg
      viewBox="0 0 1024 1024"
      className="icon">
      <path
        d="M245.33 128h533.33A117.33 117.33 0 0 1 896 245.33v533.33A117.33 117.33 0 0 1 778.67 896H245.33A117.33 117.33 0 0 1 128 778.67V245.33A117.33 117.33 0 0 1 245.33 128z m0 64c-29.44 0-53.33 23.89-53.33 53.33v533.33c0 29.44 23.89 53.33 53.33 53.33h533.33c29.44 0 53.33-23.89 53.33-53.33V245.33c0-29.44-23.89-53.33-53.33-53.33H245.33z"/>
    </svg>
  )
}

export interface CheckboxProps {
  className?: string
  style?: JSX.CSSProperties | string
  checked?: boolean
  label?: JSX.Element
  onChange?: (checked: boolean) => void
}

const Checkbox: Component<CheckboxProps> = props => {
  const [innerChecked, setInnerChecked] = useState(props.checked ?? false)

  useEffect(() => {
    if (props.checked !== undefined) {
      setInnerChecked(props.checked)
    }
  }, [props.checked])

  return (
    <div
      style={props.style}
      className={`astroneum-checkbox ${(innerChecked && 'checked') || ''} ${props.className || ''}`}
      onClick={_ => {
        const ck = !innerChecked
        if (props.onChange) { props.onChange(ck) }
        setInnerChecked(ck)
      }}>
      {innerChecked ? <CheckedIcon/> : <NormalIcon/>}
      {
      props.label && <span className="label">{props.label}</span>}
    </div>
  )
}

export default Checkbox
