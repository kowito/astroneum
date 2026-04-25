import { type Component, type JSX } from '@/react-shared'

export interface SwitchProps {
  class?: string
  style?: JSX.CSSProperties | string
  open: boolean
  onChange: () => void
}

const Switch: Component<SwitchProps> = props => {
  return (
    <div
      style={props.style}
      class={`astroneum-switch ${props.open ? 'turn-on' : 'turn-off'} ${props.class ?? ''}`}
      onClick={_ => {
        if (props.onChange) { props.onChange() }
      }}>
      <i
        class="thumb"/>
    </div>
  )
}

export default Switch
