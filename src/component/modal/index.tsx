import { useEffect } from 'react'

import { type ParentComponent, type ParentProps, type JSX } from '@/react-shared'

import Button, { type ButtonProps } from '../button'

export interface ModalProps extends ParentProps {
  width?: number
  title?: JSX.Element
  buttons?: ButtonProps[]
  onClose?: () => void
}

let _modalIdCounter = 0

const Modal: ParentComponent<ModalProps> = (props) => {
  const titleId = `astroneum-modal-title-${++_modalIdCounter}`
  let cardRef: HTMLDivElement | undefined

  const onKeyDown = (keyboardEvent: KeyboardEvent): void => {
    if (keyboardEvent.key === 'Escape') {
      props.onClose?.()
      return
    }
    if (keyboardEvent.key === 'Tab' && cardRef) {
      const focusable = cardRef.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (keyboardEvent.shiftKey) {
        if (document.activeElement === first) { keyboardEvent.preventDefault(); last?.focus() }
      } else {
        if (document.activeElement === last) { keyboardEvent.preventDefault(); first?.focus() }
      }
    }
  }

  useEffect(() => {
    document.addEventListener('keydown', onKeyDown)
    // Move focus into modal
    const btn = cardRef?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    btn?.focus()

    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="astroneum-modal modal is-active">
      <div
        className="modal-background"
        onClick={props.onClose}/>
      <div
        ref={el => { cardRef = el }}
        style={{ width: `${props.width ?? 400}px` }}
        className="modal-card">
        <header
          className="modal-card-head">
          <p id={titleId} className="modal-card-title">{props.title}</p>
          <button
            className="delete"
            aria-label="close"
            onClick={props.onClose}/>
        </header>
        <section
          className="modal-card-body">
          {props.children}
        </section>
        {
          (props.buttons && props.buttons.length > 0) && (
            <footer
              className="modal-card-foot">
              {
                props.buttons.map((button, index) => {
                  return (
                    <Button key={`modal-button-${index}`} {...button}>
                      {button.children}
                    </Button>
                  )
                })
              }
            </footer>
          )
        }
      </div>
    </div>
  )
}

export default Modal
