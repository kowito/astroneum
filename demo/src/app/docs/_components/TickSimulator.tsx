'use client'

import { useState } from 'react'

interface Bar {
  t: number
  o: number
  h: number
  l: number
  c: number
}

type Outcome = 'append' | 'replace' | 'ignore'

const MINUTE = 60_000
const START = Date.UTC(2026, 0, 5, 10, 0)
const SHOWN = 9

const VERDICTS: Record<Outcome, string> = {
  append: 'The timestamp is newer than the last bar, so a new bar is added. The previous bar is now final.',
  replace: 'The timestamp equals the last bar, so that bar is replaced in place. This is how the price "moves".',
  ignore: 'The timestamp is older than the last bar, so it is ignored. The chart never goes back in time.',
}

function seed(): Bar[] {
  const closes = [100, 101.2, 100.4, 102.1, 101.6, 103]
  let previous = 99.6
  return closes.map((c, i) => {
    const o = previous
    previous = c
    return { t: START + i * MINUTE, o, h: Math.max(o, c) + 0.5, l: Math.min(o, c) - 0.5, c }
  })
}

/** The rule the chart applies to every bar a datafeed sends. */
function apply(bars: Bar[], bar: Bar): { bars: Bar[], outcome: Outcome, index: number } {
  const last = bars[bars.length - 1]
  if (bar.t > last.t) return { bars: [...bars, bar], outcome: 'append', index: bars.length }
  if (bar.t === last.t) return { bars: [...bars.slice(0, -1), bar], outcome: 'replace', index: bars.length - 1 }
  return { bars, outcome: 'ignore', index: -1 }
}

const clock = (t: number): string => new Date(t).toISOString().slice(11, 16)
const money = (n: number): string => n.toFixed(2)
const move = (): number => (Math.random() - 0.45) * 2.2

function candle(open: number, close: number, previousHigh: number, previousLow: number): Pick<Bar, 'o' | 'h' | 'l' | 'c'> {
  return { o: open, c: close, h: Math.max(open, close, previousHigh) + 0.1, l: Math.min(open, close, previousLow) - 0.1 }
}

/** Send bars to a tiny chart and see what the chart does with each one. */
export default function TickSimulator() {
  const [bars, setBars] = useState<Bar[]>(seed)
  const [incoming, setIncoming] = useState<Bar | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [flash, setFlash] = useState({ index: -1, count: 0 })

  const send = (bar: Bar): void => {
    const result = apply(bars, bar)
    setBars(result.bars)
    setIncoming(bar)
    setOutcome(result.outcome)
    setFlash(previous => ({ index: result.index, count: previous.count + 1 }))
  }

  const last = bars[bars.length - 1]
  const sameTime = (): void => {
    const close = last.c + move()
    send({ t: last.t, ...candle(last.o, close, last.h, last.l) })
  }
  const nextMinute = (): void => {
    const close = last.c + move()
    send({ t: last.t + MINUTE, ...candle(last.c, close, -Infinity, Infinity) })
  }
  const olderTime = (): void => {
    const target = bars[Math.max(0, bars.length - 3)]
    send({ t: target.t, ...candle(target.o, target.c + 2.5, target.h, target.l) })
  }
  const reset = (): void => {
    setBars(seed())
    setIncoming(null)
    setOutcome(null)
    setFlash({ index: -1, count: 0 })
  }

  const visible = bars.slice(-SHOWN)
  const offset = bars.length - visible.length
  const all = incoming !== null ? [...visible, incoming] : visible
  const hi = Math.max(...all.map(b => b.h)) + 0.4
  const lo = Math.min(...all.map(b => b.l)) - 0.4
  const y = (v: number): number => 14 + (1 - (v - lo) / (hi - lo)) * 150
  const x = (i: number): number => 28 + i * 46

  const drawCandle = (bar: Bar, cx: number, extra = ''): React.ReactElement => {
    const up = bar.c >= bar.o
    const color = up ? 'var(--green)' : 'var(--red)'
    const top = y(Math.max(bar.o, bar.c))
    const height = Math.max(2, Math.abs(y(bar.o) - y(bar.c)))
    return (
      <g className={extra} stroke={color} fill={color}>
        <line x1={cx} x2={cx} y1={y(bar.h)} y2={y(bar.l)} strokeWidth={2} />
        <rect x={cx - 12} y={top} width={24} height={height} rx={2} />
      </g>
    )
  }

  return (
    <div className="dc-sim">
      <svg viewBox="0 0 640 210" role="img" aria-label="A small candlestick chart and the bar being sent to it">
        {visible.map((bar, i) => (
          <g key={bar.t}>
            {drawCandle(bar, x(i), offset + i === flash.index ? `sim-flash sim-flash-${flash.count % 2}` : '')}
            <text x={x(i)} y={196} textAnchor="middle">{clock(bar.t)}</text>
          </g>
        ))}
        <line x1={x(SHOWN - 0.35)} x2={x(SHOWN - 0.35)} y1={10} y2={190} className="sim-divider" />
        <text x={x(SHOWN + 0.5)} y={12} textAnchor="middle" className="sim-label">incoming</text>
        {incoming !== null
          ? <g className={`sim-ghost sim-ghost-${outcome ?? ''}`}>{drawCandle(incoming, x(SHOWN + 0.5))}<text x={x(SHOWN + 0.5)} y={196} textAnchor="middle">{clock(incoming.t)}</text></g>
          : <text x={x(SHOWN + 0.5)} y={95} textAnchor="middle" className="sim-label">nothing yet</text>}
      </svg>

      <div className="sim-controls" role="group" aria-label="Send a bar">
        <button type="button" onClick={sameTime}>Send: same timestamp</button>
        <button type="button" onClick={nextMinute}>Send: next minute</button>
        <button type="button" onClick={olderTime}>Send: an older timestamp</button>
        <button type="button" className="sim-reset" onClick={reset}>Reset</button>
      </div>

      <div className="sim-readout" aria-live="polite">
        <pre>{incoming === null
          ? '// press a button: this is what your datafeed does'
          : `callback({ timestamp: "${clock(incoming.t)}", open: ${money(incoming.o)}, close: ${money(incoming.c)}, ... })`}
        </pre>
        {outcome !== null && (
          <p className={`sim-verdict sim-verdict-${outcome}`}>
            <strong>{outcome === 'append' ? 'New bar' : outcome === 'replace' ? 'Replaced' : 'Ignored'}</strong> {VERDICTS[outcome]}
          </p>
        )}
      </div>
    </div>
  )
}
