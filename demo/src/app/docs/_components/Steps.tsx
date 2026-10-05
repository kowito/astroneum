import type { ReactNode } from 'react'

/** A numbered sequence. Each <Step> shows its number in a badge on a rail. */
export function Steps({ children }: { children: ReactNode }) {
  return <ol className="dc-steps">{children}</ol>
}

export function Step({ id, title, children }: { id?: string, title: string, children: ReactNode }) {
  return (
    <li className="dc-step">
      <h3 id={id}>{title}</h3>
      <div className="dc-step-body">{children}</div>
    </li>
  )
}
