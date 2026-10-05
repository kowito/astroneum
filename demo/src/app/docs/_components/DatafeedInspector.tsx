'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import type { AstroneumHandle } from 'astroneum'

import { MOCK_SYMBOLS, createMockDatafeed, type MockEvent } from '../../../docs/mockMarket'
import LiveChart from './LiveChart'

interface Entry {
  id: number
  at: number
  event: MockEvent
}

const MAX_ENTRIES = 120
const hhmm = (time: number): string => new Date(time).toISOString().slice(11, 16)

function describe(event: MockEvent): { label: string, detail: string } {
  switch (event.kind) {
    case 'search': return { label: 'searchSymbols', detail: `("${event.query}")` }
    case 'history': return { label: 'getHistoryData', detail: `(${event.symbol}, ${event.period}, ${hhmm(event.from)} to ${hhmm(event.to)})  returned ${event.bars} bars` }
    case 'subscribe': return { label: 'subscribe', detail: `(${event.symbol}, ${event.period}, callback)` }
    case 'unsubscribe': return { label: 'unsubscribe', detail: `(${event.symbol}, ${event.period})` }
    case 'tick': return { label: 'callback', detail: `({ timestamp: ${hhmm(event.timestamp)}, close: ${event.close.toFixed(2)} })  ${event.newBar ? 'new bar' : 'same bar, replaced'}` }
  }
}

/** A chart whose datafeed narrates every call the chart makes to it. */
export default function DatafeedInspector() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [showTicks, setShowTicks] = useState(true)
  const [symbolIndex, setSymbolIndex] = useState(0)
  const [periodText, setPeriodText] = useState('1m')
  const counter = useRef(0)
  const start = useRef(typeof performance === 'undefined' ? 0 : performance.now())
  const chart = useRef<AstroneumHandle>(null)

  const onEvent = useCallback((event: MockEvent) => {
    counter.current += 1
    const entry = { id: counter.current, at: performance.now() - start.current, event }
    setEntries(previous => [...previous, entry].slice(-MAX_ENTRIES))
  }, [])
  const datafeed = useMemo(() => createMockDatafeed({ onEvent }), [onEvent])

  const totals = entries.reduce<Record<string, number>>((sum, entry) => ({ ...sum, [entry.event.kind]: (sum[entry.event.kind] ?? 0) + 1 }), {})
  const shown = entries.filter(entry => showTicks || entry.event.kind !== 'tick').slice(-40).reverse()

  const switchSymbol = (): void => {
    const next = (symbolIndex + 1) % MOCK_SYMBOLS.length
    setSymbolIndex(next)
    chart.current?.setSymbol(MOCK_SYMBOLS[next])
  }
  const switchPeriod = (): void => {
    const five = periodText === '1m'
    setPeriodText(five ? '5m' : '1m')
    chart.current?.setPeriod({ multiplier: five ? 5 : 1, timespan: 'minute', text: five ? '5m' : '1m' })
  }

  return (
    <div className="dc-playground">
      <div className="di-actions">
        <button type="button" onClick={switchSymbol}>Switch symbol ({MOCK_SYMBOLS[symbolIndex].ticker} → {MOCK_SYMBOLS[(symbolIndex + 1) % MOCK_SYMBOLS.length].ticker})</button>
        <button type="button" onClick={switchPeriod}>Switch timeframe ({periodText} → {periodText === '1m' ? '5m' : '1m'})</button>
        <button type="button" onClick={() => { setEntries([]) }}>Clear log</button>
        <label><input type="checkbox" checked={showTicks} onChange={() => { setShowTicks(value => !value) }} /> Show live updates</label>
      </div>
      <div className="di-stage">
        <LiveChart ref={chart} eager datafeed={datafeed} symbol={MOCK_SYMBOLS[0]} height={460} />
        <div className="di-log" aria-live="off">
          <div className="di-totals">
            {(['history', 'subscribe', 'unsubscribe', 'tick'] as const).map(kind => (
              <span key={kind} data-kind={kind}><b>{totals[kind] ?? 0}</b> {kind === 'tick' ? 'updates sent' : kind}</span>
            ))}
          </div>
          <ol>
            {shown.length === 0 && <li className="di-empty">Waiting for the chart to call your datafeed…</li>}
            {shown.map(entry => {
              const { label, detail } = describe(entry.event)
              return (
                <li key={entry.id} data-kind={entry.event.kind}>
                  <time>+{(entry.at / 1000).toFixed(1)}s</time>
                  <code><strong>{label}</strong>{detail}</code>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </div>
  )
}
