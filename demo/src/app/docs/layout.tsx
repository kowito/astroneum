import type { Metadata } from 'next'
import Link from 'next/link'

import { REPO_URL, NPM_URL } from '../../site'
import DocsNav from './_components/DocsNav'
import MobileMenu from './_components/MobileMenu'
import Toc from './_components/Toc'
import './docs.css'

export const metadata: Metadata = {
  title: { default: 'Documentation', template: '%s · Astroneum docs' },
  description: 'Guides for Astroneum, the React charting library: getting started, chart types, datafeeds, indicators, speed and offline, and how it works. With live examples.',
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dc">
      <header className="dc-header">
        <Link href="/" className="dc-logo">Astroneum</Link>
        <span className="dc-header-sep" aria-hidden>/</span>
        <Link href="/docs/" className="dc-header-docs">Docs</Link>
        <nav aria-label="Site" className="dc-header-links">
          <Link href="/demo/">Live demo</Link>
          <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>
          <a href={NPM_URL} target="_blank" rel="noreferrer">npm</a>
        </nav>
      </header>
      <MobileMenu />
      <div className="dc-body">
        <aside className="dc-sidebar"><DocsNav /></aside>
        <main className="dc-content">{children}</main>
        <aside className="dc-aside"><Toc /></aside>
      </div>
    </div>
  )
}
