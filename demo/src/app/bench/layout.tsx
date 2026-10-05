import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Render benchmark',
  robots: { index: false, follow: false }
}

export default function BenchLayout ({ children }: { children: ReactNode }) {
  return children
}
