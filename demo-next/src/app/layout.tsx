import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Astroneum Chart Demo',
  description: 'Next.js demo for the astroneum charting library',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
