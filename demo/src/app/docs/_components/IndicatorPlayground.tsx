'use client'

import { useMemo, useState } from 'react'

import { MOCK_SYMBOLS, createMockDatafeed } from '../../../docs/mockMarket'
import CodeBlock from './CodeBlock'
import LiveChart, { type IndicatorDef } from './LiveChart'

interface Option {
  name: string
  note: string
  /** Shown in the code when set; otherwise the indicator's own defaults apply. */
  calcParams?: number[]
}

const OVERLAYS: Option[] = [
  { name: 'EMA', note: 'Exponential moving averages', calcParams: [7, 25, 99] },
  { name: 'SMA', note: 'Simple moving average', calcParams: [20] },
  { name: 'BOLL', note: 'Bollinger Bands' },
  { name: 'SAR', note: 'Parabolic stop and reverse' },
  { name: 'Ichimoku', note: 'Ichimoku cloud' },
  { name: 'SuperTrend', note: 'Trend-following band' },
]

const PANES: Option[] = [
  { name: 'VOL', note: 'Volume' },
  { name: 'RSI', note: 'Relative strength' },
  { name: 'MACD', note: 'Trend and momentum' },
  { name: 'KDJ', note: 'Stochastic oscillator' },
  { name: 'ATR', note: 'Average true range' },
  { name: 'OBV', note: 'On-balance volume' },
  { name: 'LINE', note: 'Live close-price line' },
]

function toggle(list: string[], name: string): string[] {
  return list.includes(name) ? list.filter(item => item !== name) : [...list, name]
}

/** Tick indicators on and off and watch the chart, and the props that produce it, change. */
export default function IndicatorPlayground() {
  const [overlays, setOverlays] = useState<string[]>(['EMA', 'BOLL'])
  const [panes, setPanes] = useState<string[]>(['VOL', 'RSI'])
  const datafeed = useMemo(() => createMockDatafeed(), [])

  // Keep the order of the picker, not the order of the clicks.
  const main = useMemo<IndicatorDef[]>(
    () => OVERLAYS.filter(o => overlays.includes(o.name)).map(o => (o.calcParams !== undefined ? { name: o.name, calcParams: o.calcParams } : { name: o.name })),
    [overlays]
  )
  const sub = useMemo(() => PANES.filter(p => panes.includes(p.name)).map(p => p.name), [panes])

  const code = `<AstroneumChart
  symbol={symbol}
  period={period}
  datafeed={datafeed}
  mainIndicators={[${main.map(def => (def.calcParams !== undefined ? `{ name: '${def.name}', calcParams: [${def.calcParams.join(', ')}] }` : `{ name: '${def.name}' }`)).join(', ')}]}
  subIndicators={[${sub.map(name => `'${name}'`).join(', ')}]}
/>`

  const group = (title: string, options: Option[], selected: string[], set: (next: string[]) => void): React.ReactElement => (
    <fieldset className="ip-group">
      <legend>{title}</legend>
      {options.map(option => (
        <label key={option.name} title={option.note}>
          <input type="checkbox" checked={selected.includes(option.name)} onChange={() => { set(toggle(selected, option.name)) }} />
          <span>{option.name}</span>
        </label>
      ))}
    </fieldset>
  )

  return (
    <div className="dc-playground">
      <div className="ip-controls">
        {group('On the price chart (mainIndicators)', OVERLAYS, overlays, setOverlays)}
        {group('In their own pane (subIndicators)', PANES, panes, setPanes)}
      </div>
      <div className="ip-stage">
        <LiveChart eager datafeed={datafeed} symbol={MOCK_SYMBOLS[0]} mainIndicators={main} subIndicators={sub} height={520} />
        <CodeBlock code={code} title="the props right now" />
      </div>
    </div>
  )
}
