import { type ParentComponent, type ParentProps, type JSX } from '@/react-shared'

export type ButtonType = 'confirm' | 'cancel'

export interface ButtonProps extends ParentProps {
  className?: string
  style?: JSX.CSSProperties | string
  type?: ButtonType
  onClick?: () => void
}

const Button: ParentComponent<ButtonProps> = props => {
  return (
    <button
      style={props.style}
      className={`astroneum-button button is-small ${props.type === 'confirm' ? 'is-primary' : ''} ${props.className ?? ''}`}
      onClick={props.onClick}>
      {props.children}
    </button>
  )
}

export default Button
