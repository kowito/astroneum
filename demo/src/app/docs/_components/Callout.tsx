import type { ReactNode } from 'react'

const LABELS = { tip: 'Tip', note: 'Note', warn: 'Careful' } as const

export default function Callout({ kind = 'note', title, children }: { kind?: keyof typeof LABELS, title?: string, children: ReactNode }) {
  return (
    <aside className={`dc-callout dc-callout-${kind}`}>
      <strong className="dc-callout-title">{title ?? LABELS[kind]}</strong>
      <div>{children}</div>
    </aside>
  )
}
