import React from 'react'
import { createRoot, type Root } from 'react-dom/client'

const roots = new WeakMap<Element, Root>()

export function render(fn: () => React.ReactNode, element: Element): () => void {
  let root = roots.get(element)
  if (!root) {
    root = createRoot(element)
    roots.set(element, root)
  }

  root.render(React.createElement(React.Fragment, null, fn()))

  return () => {
    root?.unmount()
    roots.delete(element)
  }
}
