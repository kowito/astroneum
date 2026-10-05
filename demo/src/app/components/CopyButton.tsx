'use client'

import { useState } from 'react'

/** Copies `text` to the clipboard and says so for a moment. */
export default function CopyButton({ text, label = 'Copy' }: { text: string, label?: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard blocked (insecure context or permissions): leave the text selectable.
    }
  }

  return (
    <button type="button" className="lp-copy" onClick={() => { void copy() }} aria-live="polite">
      {copied ? 'Copied' : label}
    </button>
  )
}
