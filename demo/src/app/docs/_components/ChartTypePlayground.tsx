'use client'

import { useMemo, useState } from 'react'
import { STANDARD_CRYPTO_SYMBOLS, createStandardCryptoDatafeed, createTransformedDatafeed } from 'astroneum'

import { CHART_TYPES, findChartType } from '../../../chartTypes'
import { MOCK_SYMBOLS, createMockDatafeed } from '../../../docs/mockMarket'
import { asset } from '../../../site'
import CodeBlock from './CodeBlock'
import LiveChart from './LiveChart'

const STYLE_SNIPPET = (style: string): string => `<AstroneumChart
  symbol={symbol}
  period={period}
  datafeed={datafeed}
  styles={{ candle: { type: '${style}' } }}
/>`

const DERIVED_SNIPPETS: Record<string, string> = {
  'heikin-ashi': `import { createTransformedDatafeed, heikinAshi } from 'astroneum'

// Same timestamps, smoothed values.
const feed = createTransformedDatafeed(datafeed, () => heikinAshi)

<AstroneumChart key="heikin-ashi" datafeed={feed} symbol={symbol} period={period} />`,
  renko: `import { createTransformedDatafeed, generateRenko } from 'astroneum'

// The factory runs once on the loaded history, so the brick size stays fixed.
const feed = createTransformedDatafeed(datafeed, (history) => {
  const brick = averageRange(history)   // your choice of size
  return (bars) => generateRenko(bars, brick)
})

<AstroneumChart key="renko" datafeed={feed} symbol={symbol} period={period} />`,
  range: `import { createTransformedDatafeed, generateRangeBars } from 'astroneum'

const feed = createTransformedDatafeed(datafeed, (history) => {
  const range = averageRange(history) * 3   // price range per bar
  return (bars) => generateRangeBars(bars, range)
})

<AstroneumChart key="range" datafeed={feed} symbol={symbol} period={period} />`,
}

/** Pick any of the eight chart types and see it run, with the code that sets it up. */
export default function ChartTypePlayground() {
  const [id, setId] = useState('candles')
  const [source, setSource] = useState<'sim' | 'live'>('sim')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const type = findChartType(id)

  const base = useMemo(
    () => (source === 'sim' ? createMockDatafeed() : createStandardCryptoDatafeed({ smoothingDuration: 320 })),
    [source]
  )
  const datafeed = useMemo(
    () => (type.derive !== undefined ? createTransformedDatafeed(base, type.derive) : base),
    [base, type]
  )
  const styles = useMemo(() => ({ candle: { type: type.style } }), [type.style])
  const symbol = source === 'sim' ? MOCK_SYMBOLS[0] : STANDARD_CRYPTO_SYMBOLS[0]
  const derived = type.derive !== undefined

  return (
    <div className="dc-playground">
      <div className="pg-types" role="group" aria-label="Chart type">
        {CHART_TYPES.map(option => (
          <button key={option.id} type="button" aria-pressed={option.id === id} onClick={() => { setId(option.id) }}>
            <img src={asset(`/gallery/${option.id}.webp`)} alt="" width={900} height={320} loading="lazy" />
            <span>{option.label}</span>
          </button>
        ))}
      </div>

      <div className="pg-options">
        <div role="group" aria-label="Data">
          <span>Data</span>
          <button type="button" aria-pressed={source === 'sim'} onClick={() => { setSource('sim') }}>Simulated</button>
          <button type="button" aria-pressed={source === 'live'} onClick={() => { setSource('live') }}>Live (Binance)</button>
        </div>
        <div role="group" aria-label="Theme">
          <span>Theme</span>
          <button type="button" aria-pressed={theme === 'dark'} onClick={() => { setTheme('dark') }}>Dark</button>
          <button type="button" aria-pressed={theme === 'light'} onClick={() => { setTheme('light') }}>Light</button>
        </div>
      </div>

      <div className="pg-stage">
        <LiveChart
          key={`${source}:${derived ? type.id : 'time'}`}
          eager
          datafeed={datafeed}
          symbol={symbol}
          theme={theme}
          styles={styles}
          height={440}
          subIndicators={['VOL']}
        />
        <div className="pg-side">
          <h3>{type.label}</h3>
          <p>{type.description}</p>
          <p className="pg-how">
            {derived
              ? <><strong>Built from your bars.</strong> Wrap the datafeed; the chart needs a new <code>key</code> when you switch.{type.timeless === true && ' Time is not on the axis, so it shows synthetic times.'}</>
              : <><strong>Drawn from your bars.</strong> One style prop. You can change it while the chart is running.</>}
          </p>
          <CodeBlock code={derived ? DERIVED_SNIPPETS[type.id] : STYLE_SNIPPET(type.style)} title={derived ? 'wrap the datafeed' : 'one prop'} />
        </div>
      </div>
    </div>
  )
}
