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
      class="astroneum-modal modal is-active">
      <div
        class="modal-background"
        onClick={props.onClose}/>
      <div
        ref={el => { cardRef = el }}
        style={{ width: `${props.width ?? 400}px` }}
        class="modal-card">
        <header
          class="modal-card-head">
          <p id={titleId} class="modal-card-title">{props.title}</p>
          <button
            class="delete"
            aria-label="close"
            onClick={props.onClose}/>
        </header>
        <section
          class="modal-card-body">
          {props.children}
        </section>
        {
          (props.buttons && props.buttons.length > 0) && (
            <footer
              class="modal-card-foot">
              {
                props.buttons.map(button => {
                  return (
                    <Button {...button}>
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
