import type { Metadata } from 'next'

import ChartDemo from '../components/ChartDemo'

export const metadata: Metadata = {
  title: 'Live demo',
  description: 'Every Astroneum chart type on live market data: candlestick, line, area, OHLC, Heikin-Ashi, Renko and range bars, with 50 indicators and drawing tools.',
}

export default function DemoPage() {
  return <ChartDemo />
}
