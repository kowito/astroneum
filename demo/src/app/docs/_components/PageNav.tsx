import Link from 'next/link'

import { docHref, neighbours } from '../../../docs/nav'

/** Previous / next links at the bottom of a page. */
export default function PageNav({ slug }: { slug: string }) {
  const { prev, next } = neighbours(slug)
  return (
    <nav className="dc-pagenav" aria-label="Previous and next page">
      {prev !== null ? <Link href={docHref(prev.slug)} rel="prev"><span>Previous</span>{prev.title}</Link> : <span />}
      {next !== null ? <Link href={docHref(next.slug)} rel="next"><span>Next</span>{next.title}</Link> : <span />}
    </nav>
  )
}
