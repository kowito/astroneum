import type { Metadata } from 'next'
import './globals.css'
import { SITE_ORIGIN, asset } from '../site'

const TITLE = 'Astroneum — professional financial charts for React'
const DESCRIPTION = 'Open-source charting library for React: candlestick, line, area, Heikin-Ashi and Renko charts, 50 indicators, drawing tools and live data. MIT licensed.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: { default: TITLE, template: '%s · Astroneum' },
  description: DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: 'Astroneum',
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: asset('/og.png'), width: 1200, height: 630, alt: 'Astroneum financial charts' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [asset('/og.png')],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
