'use client'

import 'astroneum/style.css'
import { useRef, useState, useCallback } from 'react'
import { AstroneumChart, type AstroneumHandle, type SymbolInfo, type Period } from 'astroneum'
import MockDatafeed, { MOCK_SYMBOLS } from '@/mockDatafeed'

const PERIODS: Period[] = [
  { multiplier: 1, timespan: 'minute', text: '1m' },
  { multiplier: 5, timespan: 'minute', text: '5m' },
  { multiplier: 15, timespan: 'minute', text: '15m' },
  { multiplier: 1, timespan: 'hour', text: '1H' },
  { multiplier: 4, timespan: 'hour', text: '4H' },
  { multiplier: 1, timespan: 'day', text: 'D' },
  { multiplier: 1, timespan: 'week', text: 'W' },
]

const css = {
  app: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100dvh',
    background: '#0d0e12',
    color: '#d1d4dc',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    background: '#161b22',
    borderBottom: '1px solid #30363d',
    flexShrink: 0,
    flexWrap: 'wrap' as const,
  },
  logo: {
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: '-0.5px',
    color: '#58a6ff',
    marginRight: 4,
  },
  divider: {
    width: 1,
    height: 20,
    background: '#30363d',
    margin: '0 4px',
  },
  select: {
    background: '#21262d',
    border: '1px solid #30363d',
    borderRadius: 6,
    color: '#c9d1d9',
    padding: '4px 8px',
    fontSize: 13,
    cursor: 'pointer',
    outline: 'none',
  },
  btnGroup: {
    display: 'flex',
    gap: 2,
  },
  btn: (active: boolean): React.CSSProperties => ({
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid',
    borderColor: active ? '#58a6ff' : '#30363d',
    background: active ? '#1f3a5f' : '#21262d',
    color: active ? '#58a6ff' : '#c9d1d9',
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    transition: 'all 0.15s',
  }),
  chip: (active: boolean): React.CSSProperties => ({
    padding: '3px 8px',
    borderRadius: 4,
    border: '1px solid',
    borderColor: active ? '#3fb950' : '#30363d',
    background: active ? '#1a3a24' : '#21262d',
    color: active ? '#3fb950' : '#8b949e',
    fontSize: 12,
    cursor: 'pointer',
  }),
  chartWrap: {
    flex: 1,
    minHeight: 0,
  },
  spacer: { flex: 1 },
  badge: (dark: boolean): React.CSSProperties => ({
    padding: '3px 10px',
    borderRadius: 12,
    fontSize: 12,
    background: dark ? '#161b22' : '#f0f3f9',
    color: dark ? '#8b949e' : '#57606a',
    border: '1px solid',
    borderColor: dark ? '#30363d' : '#d0d7de',
    cursor: 'pointer',
    userSelect: 'none',
  }),
}

export default function ChartDemo() {
  const chartRef = useRef<AstroneumHandle>(null)

  const [symbol, setSymbol] = useState<SymbolInfo>(MOCK_SYMBOLS[0])
  const [period, setPeriod] = useState<Period>(PERIODS[5]) // Default: 1D
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [activeSubIndicators, setActiveSubIndicators] = useState<string[]>(['VOL'])

  const SUB_INDICATORS = ['VOL', 'MACD', 'RSI', 'KDJ', 'BOLL']

  const toggleSubIndicator = useCallback((name: string) => {
    setActiveSubIndicators(prev =>
      prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name]
    )
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(t => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  return (
    <div style={{ ...css.app, background: theme === 'dark' ? '#0d0e12' : '#f6f8fa', color: theme === 'dark' ? '#d1d4dc' : '#24292f' }}>
      {/* Toolbar */}
      <div style={{ ...css.toolbar, background: theme === 'dark' ? '#161b22' : '#ffffff', borderColor: theme === 'dark' ? '#30363d' : '#d0d7de' }}>
        <span style={css.logo}>Astroneum</span>
        <div style={css.divider} />

        <select
          style={{ ...css.select, background: theme === 'dark' ? '#21262d' : '#f6f8fa', color: theme === 'dark' ? '#c9d1d9' : '#24292f', borderColor: theme === 'dark' ? '#30363d' : '#d0d7de' }}
          value={symbol.ticker}
          onChange={e => {
            const s = MOCK_SYMBOLS.find(x => x.ticker === e.target.value)
            if (s) setSymbol(s)
          }}
        >
          {MOCK_SYMBOLS.map(s => (
            <option key={s.ticker} value={s.ticker}>
              {s.ticker} — {s.name}
            </option>
          ))}
        </select>

        <div style={css.btnGroup}>
          {PERIODS.map(p => (
            <button key={p.text} style={css.btn(period.text === p.text)} onClick={() => setPeriod(p)}>
              {p.text}
            </button>
          ))}
        </div>

        <div style={css.divider} />

        {SUB_INDICATORS.map(ind => (
          <button key={ind} style={css.chip(activeSubIndicators.includes(ind))} onClick={() => toggleSubIndicator(ind)}>
            {ind}
          </button>
        ))}

        <div style={css.spacer} />

        <button style={css.badge(theme === 'dark')} onClick={toggleTheme}>
          {theme === 'dark' ? '☀ Light' : '🌙 Dark'}
        </button>
      </div>

      {/* Chart */}
      <div style={css.chartWrap}>
        <AstroneumChart
          ref={chartRef}
          symbol={symbol}
          period={period}
          periods={PERIODS}
          datafeed={MockDatafeed}
          theme={theme}
          drawingBarVisible
          mainIndicators={[{ name: 'EMA', calcParams: [7, 25, 99] }]}
          subIndicators={activeSubIndicators}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  )
}
