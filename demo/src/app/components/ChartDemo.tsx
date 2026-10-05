'use client'

import 'astroneum/style.css'
import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import {
  AstroneumChart,
  DATAFEED_ERROR_EVENT,
  STANDARD_CRYPTO_SYMBOLS,
  createStandardCryptoDatafeed,
  createTransformedDatafeed,
  type AstroneumHandle,
  type DatafeedErrorDetail,
  type SymbolInfo,
  type Period,
} from 'astroneum'
import { CHART_TYPES, DEFAULT_CHART_TYPE, findChartType } from '../../chartTypes'
import { BASE_PATH } from '../../site'
import { CATEGORIES, INDICATOR_CATALOGUE, OVERLAY_INDICATORS } from '../../indicatorCatalogue'

interface IndicatorDef {
  name: string
  calcParams?: number[]
}

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

// Name of the built-in close-price line indicator. Shown in its own pane under
// the candles and updated on every live tick.
const LINE_PANE = 'LINE'


// ---------------------------------------------------------------------------
// Inline styles
// ---------------------------------------------------------------------------
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
  select: (theme: string): React.CSSProperties => ({
    background: theme === 'dark' ? '#21262d' : '#f6f8fa',
    border: '1px solid ' + (theme === 'dark' ? '#30363d' : '#d0d7de'),
    borderRadius: 6,
    color: theme === 'dark' ? '#c9d1d9' : '#24292f',
    padding: '4px 8px',
    fontSize: 13,
    cursor: 'pointer',
    outline: 'none',
  }),
  btnGroup: { display: 'flex', gap: 2 },
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
    userSelect: 'none' as const,
  }),
  chartWrap: { flex: 1, minHeight: 0 },
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
  pickerWrap: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
  },
  pickerLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#8b949e',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  count: {
    fontSize: 12,
    color: '#8b949e',
    marginLeft: 4,
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function indicatorDef(name: string): IndicatorDef | null {
  const entry = INDICATOR_CATALOGUE.find(e => e.name === name)
  if (!entry) return null
  return { name: entry.name, calcParams: entry.defaultParams }
}

function isOverlay(name: string): boolean {
  return OVERLAY_INDICATORS.has(name)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function ChartDemo() {
  const chartRef = useRef<AstroneumHandle>(null)
  const symbols = STANDARD_CRYPTO_SYMBOLS

  const [symbol, setSymbol] = useState<SymbolInfo>(symbols[0])
  const [period, setPeriod] = useState<Period>(PERIODS[0])
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [activeSubIndicators, setActiveSubIndicators] = useState<string[]>(['VOL'])
  const [activeMainIndicators, setActiveMainIndicators] = useState<string[]>(['EMA'])
  const [datafeedError, setDatafeedError] = useState<string | null>(null)

  const sourceBadgeText = LIVE_EXCHANGES.has(String(symbol.exchange))
    ? `${String(symbol.exchange)} live feed`
    : 'Unsupported symbol'

  // Each indicator has exactly one home: overlays live on the price pane,
  // everything else in its own sub-pane. Toggling elsewhere used to add a second
  // copy (e.g. clicking the active EMA chip added EMA again instead of removing it).
  const toggleIndicator = useCallback((name: string) => {
    const setList = isOverlay(name) ? setActiveMainIndicators : setActiveSubIndicators
    setList(prev => (prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name]))
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(t => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  const datafeed = useMemo(() => createStandardCryptoDatafeed({ smoothingDuration: 320 }), [])

  // Chart type. Read from ?type=… once on the client (so each type has its own
  // link) before the chart mounts, so it never mounts twice.
  const [chartTypeId, setChartTypeId] = useState<string | null>(null)
  useEffect(() => {
    setChartTypeId(findChartType(new URLSearchParams(window.location.search).get('type')).id)
  }, [])
  const chartType = findChartType(chartTypeId ?? DEFAULT_CHART_TYPE)
  const selectChartType = useCallback((id: string) => {
    setChartTypeId(id)
    const url = new URL(window.location.href)
    url.searchParams.set('type', id)
    window.history.replaceState(null, '', url)
  }, [])

  // Types the chart draws itself are just a style; derived types (Heikin-Ashi,
  // Renko, Range) get their own datafeed, which also needs a fresh chart.
  const chartDatafeed = useMemo(
    () => (chartType.derive !== undefined ? createTransformedDatafeed(datafeed, chartType.derive) : datafeed),
    [chartType, datafeed]
  )
  const chartKey = chartType.derive !== undefined ? chartType.id : 'time'
  const chartStyles = useMemo(() => ({ candle: { type: chartType.style } }), [chartType.style])

  const linePaneVisible = activeSubIndicators.includes(LINE_PANE)
  const setLinePaneVisible = useCallback((visible: boolean) => {
    setActiveSubIndicators(prev => {
      const without = prev.filter(x => x !== LINE_PANE)
      return visible ? [...without, LINE_PANE] : without
    })
  }, [])


  useEffect(() => {
    const target = window as unknown as { __astroneum?: AstroneumHandle | null }
    const syncHandle = (): void => { target.__astroneum = chartRef.current }
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
    return () => window.removeEventListener(DATAFEED_ERROR_EVENT, onDatafeedError)
  }, [symbol.ticker])

  useEffect(() => {
    setDatafeedError(null)
  }, [symbol.ticker, period.text])

  const subIndicatorChips = activeSubIndicators
  const mainIndicatorChips = activeMainIndicators
  const mainIndicatorDefsFinal = useMemo<IndicatorDef[]>(
    () => mainIndicatorChips.map(name => indicatorDef(name)).filter(Boolean) as IndicatorDef[],
    [mainIndicatorChips]
  )

  return (
    <div style={{
      ...css.app,
      background: theme === 'dark' ? '#0d0e12' : '#f6f8fa',
      color: theme === 'dark' ? '#d1d4dc' : '#24292f'
    }}>
      {/* Toolbar */}
      <div style={{
        ...css.toolbar,
        background: theme === 'dark' ? '#161b22' : '#ffffff',
        borderColor: theme === 'dark' ? '#30363d' : '#d0d7de'
      }}>
        <a href={`${BASE_PATH}/`} style={{ ...css.logo, textDecoration: 'none' }} title="Back to the Astroneum home page">Astroneum</a>
        <span style={css.sourceBadge}>{sourceBadgeText}</span>
        {datafeedError && <span style={css.errorBadge} title={datafeedError}>{datafeedError}</span>}
        <div style={css.divider} />

        <select
          style={css.select(theme)}
          value={symbol.ticker}
          onChange={e => {
            const s = symbols.find(x => x.ticker === e.target.value)
            if (s) { setSymbol(s); chartRef.current?.setSymbol(s) }
          }}
        >
          {symbols.map(s => (
            <option key={s.ticker} value={s.ticker}>{s.ticker} — {s.name}</option>
          ))}
        </select>

        <div style={css.btnGroup}>
          {PERIODS.map(p => (
            <button
              key={p.text}
              style={css.btn(period.text === p.text)}
              onClick={() => { setPeriod(p); chartRef.current?.setPeriod(p) }}
            >
              {p.text}
            </button>
          ))}
        </div>

        <div style={css.spacer} />
        <button style={css.badge(theme === 'dark')} onClick={toggleTheme}>
          {theme === 'dark' ? '☀ Light' : '🌙 Dark'}
        </button>
      </div>

      {/* Chart type — each button is a different way to draw the same market */}
      <div style={{
        ...css.toolbar,
        background: theme === 'dark' ? '#0d1117' : '#f0f3f9',
        borderBottom: '1px solid ' + (theme === 'dark' ? '#30363d' : '#d0d7de'),
        padding: '6px 12px',
      }}>
        <span style={css.pickerLabel}>Chart type</span>
        <div style={{ ...css.btnGroup, flexWrap: 'wrap' }} role="group" aria-label="Chart type">
          {CHART_TYPES.map(type => (
            <button
              key={type.id}
              style={css.btn(chartType.id === type.id)}
              aria-pressed={chartType.id === type.id}
              title={type.description}
              onClick={() => selectChartType(type.id)}
            >
              {type.label}
            </button>
          ))}
        </div>
        <div style={css.divider} />
        <button
          style={css.chip(linePaneVisible)}
          aria-pressed={linePaneVisible}
          title="Add a live close-price line chart in its own pane under the chart"
          onClick={() => setLinePaneVisible(!linePaneVisible)}
        >
          + Line pane
        </button>
        <span style={{ color: '#8b949e', fontSize: 12 }}>
          {chartType.description}
          {chartType.timeless && ' The time axis shows synthetic times.'}
        </span>
      </div>

      {/* Indicator picker — category rows */}
      <div style={{
        ...css.toolbar,
        background: theme === 'dark' ? '#0d1117' : '#f0f3f9',
        borderBottom: '1px solid ' + (theme === 'dark' ? '#30363d' : '#d0d7de'),
        gap: 6, padding: '4px 12px', overflowX: 'auto', flexWrap: 'nowrap',
      }}>
        {CATEGORIES.map(({ category, items }) => (
          <div key={category} style={{ ...css.pickerWrap, flexShrink: 0 }}>
            <span style={css.pickerLabel}>{category}</span>
            {items.map(e => {
              const isActive = activeMainIndicators.includes(e.name) || activeSubIndicators.includes(e.name)
              const overlay = isOverlay(e.name)
              return (
                <button
                  key={e.name}
                  title={`${e.description}${overlay ? ' (overlay → main pane)' : ''}`}
                  style={{
                    ...css.chip(isActive),
                    borderColor: isActive ? (overlay ? '#d29922' : '#3fb950') : undefined,
                    background: isActive ? (overlay ? '#3d2e00' : '#1a3a24') : undefined,
                    color: isActive ? (overlay ? '#d29922' : '#3fb950') : undefined,
                  }}
                  onClick={() => toggleIndicator(e.name)}
                >
                  {e.name}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {/* Active indicator bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 12px',
        background: theme === 'dark' ? '#161b22' : '#ffffff',
        borderBottom: '1px solid ' + (theme === 'dark' ? '#30363d' : '#d0d7de'),
        flexShrink: 0,
        fontSize: 12,
      }}>
        <span style={{ color: '#8b949e', fontWeight: 600, textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.5px' }}>
          Active:
        </span>
        {mainIndicatorChips.length === 0 && subIndicatorChips.length === 0 && (
          <span style={{ color: '#484f58', fontStyle: 'italic' }}>none — click any indicator above to enable</span>
        )}
        {mainIndicatorChips.map(name => (
          <span key={name} style={{
            padding: '1px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
            background: '#3d2e00', color: '#d29922', border: '1px solid #d29922',
          }}>
            {name} <span style={{ opacity: 0.6, fontWeight: 400 }}>overlay</span>
          </span>
        ))}
        {subIndicatorChips.map(name => (
          <span key={name} style={{
            padding: '1px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
            background: '#1a3a24', color: '#3fb950', border: '1px solid #3fb950',
          }}>
            {name}
          </span>
        ))}
        <span style={css.count}>
          ({mainIndicatorChips.length + subIndicatorChips.length} active · 50 total)
        </span>
      </div>

      {/* Chart */}
      <div style={css.chartWrap}>
        {chartTypeId !== null && (
        <AstroneumChart
          key={chartKey}
          ref={chartRef}
          symbol={symbol}
          period={period}
          periods={PERIODS}
          datafeed={chartDatafeed}
          theme={theme}
          styles={chartStyles}
          drawingBarVisible
          mainIndicators={mainIndicatorDefsFinal}
          subIndicators={subIndicatorChips}
          style={{ width: '100%', height: '100%' }}
        />
        )}
      </div>
    </div>
  )
}
