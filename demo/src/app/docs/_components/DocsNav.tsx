'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { DOC_SECTIONS, docHref } from '../../../docs/nav'

/** The sidebar. Marks the current page; also used inside the mobile menu. */
export default function DocsNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = (usePathname() ?? '').replace(/\/?$/, '/')
  return (
    <nav className="dc-nav" aria-label="Documentation">
      {DOC_SECTIONS.map(section => (
        <div key={section.title} className="dc-nav-section">
          <p>{section.title}</p>
          <ul>
            {section.pages.map(page => {
              const href = docHref(page.slug)
              const current = pathname === href
              return (
                <li key={page.slug}>
                  <Link href={href} aria-current={current ? 'page' : undefined} onClick={onNavigate}>{page.title}</Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
