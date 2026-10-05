import Link from 'next/link'

import { docHref, type DocPage } from '../../../docs/nav'

/** A grid of links to docs pages, each with its one-line summary. */
export default function DocCards({ pages }: { pages: DocPage[] }) {
  return (
    <div className="dc-cards">
      {pages.map(page => (
        <Link key={page.slug} href={docHref(page.slug)} className="dc-card">
          <strong>{page.title}</strong>
          <span>{page.summary}</span>
        </Link>
      ))}
    </div>
  )
}
