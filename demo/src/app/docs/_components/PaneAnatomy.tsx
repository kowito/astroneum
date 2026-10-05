'use client'

import { useState } from 'react'

import CodeBlock from './CodeBlock'

interface Part {
  id: string
  title: string
  text: string
  code: string
}

const PARTS: Part[] = [
  { id: 'period', title: 'Period bar', text: 'The timeframe buttons, plus the buttons for indicators, timezone, settings, screenshots and alerts.', code: `period={{ multiplier: 1, timespan: 'hour', text: '1H' }}\nperiods={[...]}   // which timeframes to offer` },
  { id: 'tools', title: 'Drawing bar', text: 'Trend lines, Fibonacci, Gann, pitchforks, the measure tool and more. Pick a tool, then click on the chart.', code: 'drawingBarVisible={false}   // hide it' },
  { id: 'main', title: 'Main pane', text: 'The price chart: candles or a line, the overlay indicators such as EMA, and the drawings you make.', code: `styles={{ candle: { type: 'line' } }}\nmainIndicators={[{ name: 'EMA' }]}` },
  { id: 'price', title: 'Price axis', text: 'Fits itself to the prices you can see. It can be normal, logarithmic or percentage.', code: `styles={{ yAxis: { type: 'log' } }}` },
  { id: 'sub', title: 'Sub-panes', text: 'One pane for each sub-indicator, each with its own scale. Drag the divider between panes to resize.', code: `subIndicators={['VOL', 'RSI']}` },
  { id: 'time', title: 'Time axis', text: 'Shared by every pane, so panning and zooming move them all together. It uses your timezone.', code: `timezone="Asia/Bangkok"\nchart.setTimezone('America/New_York')` },
]

/** An annotated sketch of the chart. Hover or focus a part to see what it is and which prop controls it. */
export default function PaneAnatomy() {
  const [active, setActive] = useState('main')
  const part = PARTS.find(p => p.id === active) ?? PARTS[2]
  const region = (id: string, className: string, label: string): React.ReactElement => (
    <button
      type="button"
      className={`pa-region ${className}`}
      aria-pressed={active === id}
      onMouseEnter={() => { setActive(id) }}
      onFocus={() => { setActive(id) }}
      onClick={() => { setActive(id) }}
    >
      <span>{label}</span>
    </button>
  )

  return (
    <div className="dc-anatomy">
      <div className="pa-sketch" aria-label="A sketch of the chart layout">
        {region('period', 'pa-period', 'Period bar')}
        <div className="pa-middle">
          {region('tools', 'pa-tools', 'Drawing bar')}
          <div className="pa-panes">
            {region('main', 'pa-main', 'Main pane')}
            {region('sub', 'pa-sub', 'Sub-panes')}
          </div>
          {region('price', 'pa-price', 'Price axis')}
        </div>
        {region('time', 'pa-time', 'Time axis')}
      </div>
      <div className="pa-detail" aria-live="polite">
        <h3>{part.title}</h3>
        <p>{part.text}</p>
        <CodeBlock code={part.code} title="what controls it" />
      </div>
    </div>
  )
}
