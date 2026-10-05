'use client'

import { useEffect, useState } from 'react'

interface Heading {
  id: string
  text: string
  level: number
}

/** "On this page": built from the h2/h3 headings in the content, with the current one highlighted. */
export default function Toc() {
  const [headings, setHeadings] = useState<Heading[]>([])
  const [active, setActive] = useState('')

  useEffect(() => {
    const nodes = [...document.querySelectorAll<HTMLElement>('.dc-content h2[id], .dc-content h3[id]')]
    setHeadings(nodes.map(node => ({ id: node.id, text: node.textContent ?? '', level: node.tagName === 'H2' ? 2 : 3 })))
    if (nodes.length === 0) return
    const visible = new Set<string>()
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target.id)
        else visible.delete(entry.target.id)
      }
      const first = nodes.find(node => visible.has(node.id))
      if (first !== undefined) setActive(first.id)
    }, { rootMargin: '-72px 0px -65% 0px' })
    nodes.forEach(node => { observer.observe(node) })
    return () => { observer.disconnect() }
  }, [])

  if (headings.length < 2) return null
  return (
    <nav className="dc-toc" aria-label="On this page">
      <p>On this page</p>
      <ul>
        {headings.map(heading => (
          <li key={heading.id} data-level={heading.level}>
            <a href={`#${heading.id}`} aria-current={active === heading.id ? 'location' : undefined}>{heading.text}</a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
