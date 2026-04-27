'use client'

import 'astroneum/style.css'
import { useRef, useState, useCallback, useEffect } from 'react'
import {
  AstroneumChart,
  type AstroneumHandle,
  type SymbolInfo,
  type Period
} from 'astroneum'
import MockDatafeed, {
  MOCK_SYMBOLS,
  DATAFEED_ERROR_EVENT,
  type DatafeedErrorDetail,
} from '@/mockDatafeed'

const PERIODS: Period[] = [
  { multiplier: 1, timespan: 'minute', text: '1m' },
  { multiplier: 5, timespan: 'minute', text: '5m' },
  { multiplier: 15, timespan: 'minute', text: '15m' },
  { multiplier: 1, timespan: 'hour', text: '1H' },
  { multiplier: 4, timespan: 'hour', text: '4H' },
  { multiplier: 1, timespan: 'day', text: 'D' },
  { multiplier: 1, timespan: 'week', text: 'W' },
]

const LIVE_EXCHANGES = new Set(['BINANCE', 'BITGET', 'OKX'])

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
  sourceBadge: {
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid #58a6ff',
    background: '#1f3a5f',
    color: '#58a6ff',
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.4,
  },
  errorBadge: {
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid #f85149',
    background: '#4a1d1d',
    color: '#ffb4af',
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.4,
    maxWidth: 460,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
}

export default function ChartDemo() {
  const chartRef = useRef<AstroneumHandle>(null)
  const symbols = MOCK_SYMBOLS

  const [symbol, setSymbol] = useState<SymbolInfo>(symbols[0])
  const [period, setPeriod] = useState<Period>(PERIODS[0]) // Default: 1m
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [activeSubIndicators, setActiveSubIndicators] = useState<string[]>(['VOL'])
  const [datafeedError, setDatafeedError] = useState<string | null>(null)

  const sourceBadgeText = LIVE_EXCHANGES.has(String(symbol.exchange))
    ? `${String(symbol.exchange)} live feed`
    : 'Unsupported symbol'

  const SUB_INDICATORS = ['VOL', 'MACD', 'RSI', 'KDJ', 'BOLL']

  const toggleSubIndicator = useCallback((name: string) => {
    setActiveSubIndicators(prev =>
      prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name]
    )
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(t => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  const datafeed = MockDatafeed

  useEffect(() => {
    const target = window as unknown as { __astroneum?: AstroneumHandle | null }
    const syncHandle = (): void => {
      target.__astroneum = chartRef.current
    }
    syncHandle()
    const timer = window.setInterval(syncHandle, 500)
    return () => {
      window.clearInterval(timer)
      target.__astroneum = null
    }
  }, [])

  useEffect(() => {
    const onDatafeedError = (event: Event): void => {
      const detail = (event as CustomEvent<DatafeedErrorDetail>).detail
      if (!detail || detail.ticker !== symbol.ticker) return
      setDatafeedError(`[${detail.exchange ?? 'DATA'} ${detail.period}] ${detail.message}`)
    }

    window.addEventListener(DATAFEED_ERROR_EVENT, onDatafeedError)
    return () => {
      window.removeEventListener(DATAFEED_ERROR_EVENT, onDatafeedError)
    }
  }, [symbol.ticker])

  useEffect(() => {
    setDatafeedError(null)
  }, [symbol.ticker, period.text])

  return (
    <div style={{ ...css.app, background: theme === 'dark' ? '#0d0e12' : '#f6f8fa', color: theme === 'dark' ? '#d1d4dc' : '#24292f' }}>
      {/* Toolbar */}
      <div style={{ ...css.toolbar, background: theme === 'dark' ? '#161b22' : '#ffffff', borderColor: theme === 'dark' ? '#30363d' : '#d0d7de' }}>
        <span style={css.logo}>Astroneum</span>

        <span style={css.sourceBadge} title="Current source for selected symbol">
          {sourceBadgeText}
        </span>

        {datafeedError && (
          <span style={css.errorBadge} title={datafeedError}>
            {datafeedError}
          </span>
        )}

        <div style={css.divider} />

        <select
          style={{ ...css.select, background: theme === 'dark' ? '#21262d' : '#f6f8fa', color: theme === 'dark' ? '#c9d1d9' : '#24292f', borderColor: theme === 'dark' ? '#30363d' : '#d0d7de' }}
          value={symbol.ticker}
          onChange={e => {
            const s = symbols.find(x => x.ticker === e.target.value)
            if (s) {
              setSymbol(s)
              chartRef.current?.setSymbol(s)
            }
          }}
        >
          {symbols.map(s => (
            <option key={s.ticker} value={s.ticker}>
              {s.ticker} — {s.name}
            </option>
          ))}
        </select>

        <div style={css.btnGroup}>
          {PERIODS.map(p => (
            <button
              key={p.text}
              style={css.btn(period.text === p.text)}
              onClick={() => {
                setPeriod(p)
                chartRef.current?.setPeriod(p)
              }}>
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
          datafeed={datafeed}
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
