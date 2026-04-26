import { type Component, type JSX } from '@/react-shared'

export interface SwitchProps {
  className?: string
  style?: JSX.CSSProperties | string
  open: boolean
  onChange: () => void
}

const Switch: Component<SwitchProps> = props => {
  return (
    <div
      style={props.style}
      className={`astroneum-switch ${props.open ? 'turn-on' : 'turn-off'} ${props.className ?? ''}`}
      onClick={_ => {
        if (props.onChange) { props.onChange() }
      }}>
      <i
        className="thumb"/>
    </div>
  )
}

export default Switch
