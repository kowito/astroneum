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
// The demo chrome uses the chart's own TradingView-style tokens, so the page
// and the chart read as one surface in both themes.
type Tokens = typeof DARK
const DARK = {
  bg: '#131722',
  panel: '#131722',
  border: '#2A2E39',
  control: '#434651',
  text: '#D1D4DC',
  text2: '#787B86',
  hover: '#2A2E39',
  primary: '#2962FF',
  primaryBg: 'rgba(41, 98, 255, 0.2)',
  pane: '#089981',
  paneBg: 'rgba(8, 153, 129, 0.18)',
  overlay: '#FF9800',
  overlayBg: 'rgba(255, 152, 0, 0.16)',
  error: '#F23645',
  errorBg: 'rgba(242, 54, 69, 0.16)',
}
const LIGHT: Tokens = {
  bg: '#FFFFFF',
  panel: '#FFFFFF',
  border: '#E0E3EB',
  control: '#D1D4DC',
  text: '#131722',
  text2: '#787B86',
  hover: '#F0F3FA',
  primary: '#2962FF',
  primaryBg: 'rgba(41, 98, 255, 0.12)',
  pane: '#089981',
  paneBg: 'rgba(8, 153, 129, 0.12)',
  overlay: '#E65100',
  overlayBg: 'rgba(255, 152, 0, 0.14)',
  error: '#F23645',
  errorBg: 'rgba(242, 54, 69, 0.1)',
}
const tokensFor = (theme: string): Tokens => (theme === 'dark' ? DARK : LIGHT)

const FONT = '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif'

const css = {
  app: (k: Tokens): React.CSSProperties => ({
    display: 'flex',
    flexDirection: 'column',
    height: '100dvh',
    background: k.bg,
    color: k.text,
    fontFamily: FONT,
  }),
  toolbar: (k: Tokens): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minHeight: 38,
    padding: '4px 12px',
    background: k.panel,
    borderBottom: `1px solid ${k.border}`,
    flexShrink: 0,
    flexWrap: 'wrap',
  }),
  logo: (k: Tokens): React.CSSProperties => ({
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: '-0.3px',
    color: k.text,
    marginRight: 4,
    textDecoration: 'none',
  }),
  divider: (k: Tokens): React.CSSProperties => ({
    width: 1,
    height: 20,
    background: k.border,
    margin: '0 4px',
  }),
  select: (k: Tokens): React.CSSProperties => ({
    height: 30,
    background: 'transparent',
    border: `1px solid ${k.control}`,
    borderRadius: 4,
    color: k.text,
    padding: '0 8px',
    fontSize: 14,
    fontFamily: FONT,
    cursor: 'pointer',
    outline: 'none',
  }),
  btnGroup: { display: 'flex', gap: 2 },
  // A toolbar toggle: plain text, blue when selected
  btn: (k: Tokens, active: boolean): React.CSSProperties => ({
    height: 30,
    padding: '0 8px',
    borderRadius: 4,
    border: 'none',
    background: active ? k.primaryBg : 'transparent',
    color: active ? k.primary : k.text,
    fontSize: 14,
    fontFamily: FONT,
    cursor: 'pointer',
  }),
  // An indicator chip: outlined, tinted by where the indicator draws when on
  chip: (k: Tokens, active: boolean, kind: 'pane' | 'overlay' = 'pane'): React.CSSProperties => ({
    height: 24,
    padding: '0 8px',
    borderRadius: 4,
    border: `1px solid ${active ? (kind === 'overlay' ? k.overlay : k.pane) : k.border}`,
    background: active ? (kind === 'overlay' ? k.overlayBg : k.paneBg) : 'transparent',
    color: active ? (kind === 'overlay' ? k.overlay : k.pane) : k.text,
    fontSize: 12,
    fontFamily: FONT,
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  }),
  chartWrap: { flex: 1, minHeight: 0 },
  spacer: { flex: 1 },
  badge: (k: Tokens): React.CSSProperties => ({
    height: 30,
    padding: '0 12px',
    borderRadius: 4,
    fontSize: 14,
    fontFamily: FONT,
    background: 'transparent',
    color: k.text,
    border: `1px solid ${k.control}`,
    cursor: 'pointer',
    userSelect: 'none',
  }),
  sourceBadge: (k: Tokens): React.CSSProperties => ({
    padding: '2px 8px',
    borderRadius: 4,
    background: k.primaryBg,
    color: k.primary,
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.5,
  }),
  errorBadge: (k: Tokens): React.CSSProperties => ({
    padding: '2px 8px',
    borderRadius: 4,
    background: k.errorBg,
    color: k.error,
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.5,
    maxWidth: 460,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }),
  pickerWrap: {
    display: 'flex',
    gap: 4,
    alignItems: 'center',
  },
  pickerLabel: (k: Tokens): React.CSSProperties => ({
    fontSize: 11,
    fontWeight: 600,
    color: k.text2,
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    marginRight: 2,
  }),
  count: (k: Tokens): React.CSSProperties => ({
    fontSize: 12,
    color: k.text2,
    marginLeft: 4,
  }),
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

  const k = tokensFor(theme)

  return (
    <div style={css.app(k)}>
      {/* Toolbar */}
      <div style={css.toolbar(k)}>
        <a href={`${BASE_PATH}/`} style={css.logo(k)} title="Back to the Astroneum home page">Astroneum</a>
        <span style={css.sourceBadge(k)}>{sourceBadgeText}</span>
        {datafeedError && <span style={css.errorBadge(k)} title={datafeedError}>{datafeedError}</span>}
        <div style={css.divider(k)} />

        <select
          style={css.select(k)}
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
              style={css.btn(k, period.text === p.text)}
              aria-pressed={period.text === p.text}
              onClick={() => { setPeriod(p); chartRef.current?.setPeriod(p) }}
            >
              {p.text}
            </button>
          ))}
        </div>

        <div style={css.spacer} />
        <button style={css.badge(k)} onClick={toggleTheme}>
          {theme === 'dark' ? '☀ Light' : '🌙 Dark'}
        </button>
      </div>

      {/* Chart type — each button is a different way to draw the same market */}
      <div style={css.toolbar(k)}>
        <span style={css.pickerLabel(k)}>Chart type</span>
        <div style={{ ...css.btnGroup, flexWrap: 'wrap' }} role="group" aria-label="Chart type">
          {CHART_TYPES.map(type => (
            <button
              key={type.id}
              style={css.btn(k, chartType.id === type.id)}
              aria-pressed={chartType.id === type.id}
              title={type.description}
              onClick={() => selectChartType(type.id)}
            >
              {type.label}
            </button>
          ))}
        </div>
        <div style={css.divider(k)} />
        <button
          style={css.chip(k, linePaneVisible)}
          aria-pressed={linePaneVisible}
          title="Add a live close-price line chart in its own pane under the chart"
          onClick={() => setLinePaneVisible(!linePaneVisible)}
        >
          + Line pane
        </button>
        <span style={{ color: k.text2, fontSize: 12 }}>
          {chartType.description}
          {chartType.timeless && ' The time axis shows synthetic times.'}
        </span>
      </div>

      {/* Indicator picker — category rows */}
      <div style={{ ...css.toolbar(k), gap: 12, overflowX: 'auto', flexWrap: 'nowrap' }}>
        {CATEGORIES.map(({ category, items }) => (
          <div key={category} style={{ ...css.pickerWrap, flexShrink: 0 }}>
            <span style={css.pickerLabel(k)}>{category}</span>
            {items.map(e => {
              const isActive = activeMainIndicators.includes(e.name) || activeSubIndicators.includes(e.name)
              const overlay = isOverlay(e.name)
              return (
                <button
                  key={e.name}
                  title={`${e.description}${overlay ? ' (overlay → main pane)' : ''}`}
                  aria-pressed={isActive}
                  style={css.chip(k, isActive, overlay ? 'overlay' : 'pane')}
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
      <div style={{ ...css.toolbar(k), minHeight: 30, gap: 6, fontSize: 12 }}>
        <span style={css.pickerLabel(k)}>
          Active:
        </span>
        {mainIndicatorChips.length === 0 && subIndicatorChips.length === 0 && (
          <span style={{ color: k.text2, fontStyle: 'italic' }}>none — click any indicator above to enable</span>
        )}
        {mainIndicatorChips.map(name => (
          <span key={name} style={{ ...css.chip(k, true, 'overlay'), height: 20, display: 'inline-flex', alignItems: 'center', fontWeight: 600, cursor: 'default' }}>
            {name} <span style={{ opacity: 0.7, fontWeight: 400, marginLeft: 4 }}>overlay</span>
          </span>
        ))}
        {subIndicatorChips.map(name => (
          <span key={name} style={{ ...css.chip(k, true, 'pane'), height: 20, display: 'inline-flex', alignItems: 'center', fontWeight: 600, cursor: 'default' }}>
            {name}
          </span>
        ))}
        <span style={css.count(k)}>
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
