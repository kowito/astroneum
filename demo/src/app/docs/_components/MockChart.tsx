'use client'

import { useMemo } from 'react'
import { createTransformedDatafeed } from 'astroneum'

import { findChartType } from '../../../chartTypes'
import { MOCK_SYMBOLS, createMockDatafeed } from '../../../docs/mockMarket'
import LiveChart, { type LiveChartProps } from './LiveChart'

type MockChartProps = Omit<LiveChartProps, 'datafeed' | 'symbol' | 'styles'> & {
  /** One of the chart type ids: candles, line, area, renko, ... */
  typeId?: string
}

/**
 * A chart on the simulated market, for examples that just need a chart.
 * Chart types built from the data (Heikin-Ashi, Renko, range) get their own datafeed.
 */
export default function MockChart({ typeId = 'candles', ...rest }: MockChartProps) {
  const type = findChartType(typeId)
  const feed = useMemo(() => createMockDatafeed(), [])
  const datafeed = useMemo(
    () => (type.derive !== undefined ? createTransformedDatafeed(feed, type.derive) : feed),
    [feed, type]
  )
  const styles = useMemo(() => ({ candle: { type: type.style } }), [type.style])
  return (
    <LiveChart
      key={type.derive !== undefined ? type.id : 'time'}
      datafeed={datafeed}
      symbol={MOCK_SYMBOLS[0]}
      styles={styles}
      {...rest}
    />
  )
}
