import { type ParentComponent, type ParentProps, type JSX } from '@/react-shared'

export type ButtonType = 'confirm' | 'cancel'

export interface ButtonProps extends ParentProps {
  class?: string
  style?: JSX.CSSProperties | string
  type?: ButtonType
  onClick?: () => void
}

const Button: ParentComponent<ButtonProps> = props => {
  return (
    <button
      style={props.style}
      class={`astroneum-button button is-small ${props.type === 'confirm' ? 'is-primary' : ''} ${props.class ?? ''}`}
      onClick={props.onClick}>
      {props.children}
    </button>
  )
}

export default Button
