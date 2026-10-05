'use client'

import dynamic from 'next/dynamic'

import { asset } from '../../site'

// The chart is loaded after the page paints; until then (and for visitors
// without JavaScript) a snapshot of the same chart type stands in for it.
const HeroChart = dynamic(async () => await import('./HeroChart'), {
  ssr: false,
  loading: () => (
    <img
      className="lp-hero-placeholder"
      src={asset('/gallery/area.webp')}
      alt="A live-updating Bitcoin price chart"
      width={900}
      height={320}
    />
  ),
})

export default function HeroChartLoader() {
  return <HeroChart />
}
