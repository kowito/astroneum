export interface DocPage {
  slug: string
  title: string
  summary: string
}

export interface DocSection {
  title: string
  pages: DocPage[]
}

/** The docs sidebar. A page's slug is its folder under /docs/ ('' is the overview). */
export const DOC_SECTIONS: DocSection[] = [
  {
    title: 'Start here',
    pages: [
      { slug: '', title: 'Overview', summary: 'What Astroneum is and where to begin.' },
      { slug: 'getting-started', title: 'Getting started', summary: 'From an empty folder to a live chart in ten steps.' },
    ],
  },
  {
    title: 'Guides',
    pages: [
      { slug: 'chart-types', title: 'Chart types', summary: 'Eight ways to draw the same market. Try each one.' },
      { slug: 'datafeeds', title: 'Datafeeds', summary: 'Connect your data, and watch the chart call your code.' },
      { slug: 'indicators', title: 'Indicators', summary: 'Add indicators with props and see them appear.' },
      { slug: 'performance', title: 'Speed and offline', summary: 'The history cache and indicator workers.' },
    ],
  },
  {
    title: 'Concepts',
    pages: [
      { slug: 'how-it-works', title: 'How it works', summary: 'The parts of the chart and how data moves through them.' },
    ],
  },
  {
    title: 'Reference',
    pages: [
      { slug: 'reference', title: 'Reference', summary: 'Props, methods and exports at a glance.' },
    ],
  },
]

export const ALL_DOC_PAGES: DocPage[] = DOC_SECTIONS.flatMap(section => section.pages)

export function docHref(slug: string): string {
  return slug === '' ? '/docs/' : `/docs/${slug}/`
}

/** Previous and next page in reading order, for the links at the bottom of a page. */
export function neighbours(slug: string): { prev: DocPage | null, next: DocPage | null } {
  const i = ALL_DOC_PAGES.findIndex(page => page.slug === slug)
  return { prev: i > 0 ? ALL_DOC_PAGES[i - 1] : null, next: i >= 0 && i < ALL_DOC_PAGES.length - 1 ? ALL_DOC_PAGES[i + 1] : null }
}
