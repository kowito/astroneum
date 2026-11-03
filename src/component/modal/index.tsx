import { useEffect } from 'react'

import { type ParentComponent, type ParentProps, type JSX } from '@/react-shared'

import Button, { type ButtonProps } from '../button'

export interface ModalProps extends ParentProps {
  width?: number
  /**
   * Let content spill past the body instead of scrolling it, for short dialogs
   * whose dropdowns must not be clipped by the body's scroll area.
   */
  overflowVisible?: boolean
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
      className="astroneum-modal">
      <div
        className="astroneum-modal-backdrop"
        onClick={props.onClose}/>
      <div
        ref={el => { cardRef = el }}
        style={{ width: `${props.width ?? 400}px` }}
        className={`astroneum-modal-card ${props.overflowVisible === true ? 'overflow-visible' : ''}`}>
        <header
          className="astroneum-modal-head">
          <p id={titleId} className="astroneum-modal-title">{props.title}</p>
          <button
            type="button"
            className="astroneum-modal-close"
            aria-label="close"
            onClick={props.onClose}>
            <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
            </svg>
          </button>
        </header>
        <section
          className="astroneum-modal-body">
          {props.children}
        </section>
        {
          (props.buttons && props.buttons.length > 0) && (
            <footer
              className="astroneum-modal-foot">
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
