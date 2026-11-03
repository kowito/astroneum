import { useEffect, useState } from 'react'

import { type Component, type JSX } from '@/react-shared'


// A square box; checked draws a tick inside the filled box.
const Box = ({ checked }: { checked: boolean }) => (
  <span className="box" aria-hidden="true">
    {checked && (
      <svg viewBox="0 0 12 12">
        <path d="M2.5 6.2l2.4 2.4 4.6-5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )}
  </span>
)

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
      <Box checked={innerChecked}/>
      {
      props.label && <span className="label">{props.label}</span>}
    </div>
  )
}

export default Checkbox
