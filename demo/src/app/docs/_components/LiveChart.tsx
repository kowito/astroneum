'use client'

import 'astroneum/style.css'
import { ComponentProps, forwardRef } from 'react'
import { AstroneumChart, type AstroneumHandle, type Datafeed, type Period, type SymbolInfo } from 'astroneum'

import LazyMount from './LazyMount'

export interface IndicatorDef {
  name: string
  calcParams?: number[]
}

export interface LiveChartProps {
  datafeed: Datafeed
  symbol: SymbolInfo
  period?: Period
  theme?: 'dark' | 'light'
  styles?: ComponentProps<typeof AstroneumChart>['styles']
  mainIndicators?: IndicatorDef[]
  subIndicators?: string[]
  historyCache?: ComponentProps<typeof AstroneumChart>['historyCache']
  drawingBar?: boolean
  height?: number
  /** Mount at once instead of when scrolled near the viewport. */
  eager?: boolean
}

const DEFAULT_PERIOD: Period = { multiplier: 1, timespan: 'minute', text: '1m' }

/**
 * A real Astroneum chart inside the docs. It mounts when it scrolls near the
 * screen, so a page with several examples only pays for the ones you look at.
 * The ref is the chart's handle (setSymbol, setPeriod, ...).
 */
const LiveChart = forwardRef<AstroneumHandle, LiveChartProps>(function LiveChart(props, ref) {
  const { datafeed, symbol, period = DEFAULT_PERIOD, theme = 'dark', styles, mainIndicators, subIndicators, historyCache, drawingBar = false, height = 420, eager = false } = props
  return (
    <LazyMount className="dc-live" height={height} eager={eager}>
      <AstroneumChart
        ref={ref}
        symbol={symbol}
        period={period}
        datafeed={datafeed}
        theme={theme}
        styles={styles}
        mainIndicators={mainIndicators}
        subIndicators={subIndicators}
        historyCache={historyCache}
        drawingBarVisible={drawingBar}
        style={{ width: '100%', height: '100%' }}
      />
    </LazyMount>
  )
})

export default LiveChart
