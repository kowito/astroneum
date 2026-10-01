import { startTransition, forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

import { useClockTick, useKeyboardShortcuts } from './hooks'


import logoSvgRaw from '@/assets/logo.svg'

import { init, dispose, utils } from '@/engine'

import type { Nullable, Chart, OverlayMode, PaneOptions, TooltipFeatureStyle, DataLoader, IndicatorDef } from '@/types'

import { deepSet, deepClone } from '@/utils'

import { type SelectDataSourceItem, Loading } from '@/component'

import {
  PeriodBar, DrawingBar, IndicatorModal, TimezoneModal, SettingModal,
  ScreenshotModal, IndicatorSettingModal, SymbolSearchModal,
  AlertModal, ScriptEditorModal
} from '@/widget'

import DrawingSnapper from './DrawingSnapper'
import { heikinAshi } from './PerformanceMode'
import { transformCandles } from './PriceScaleTransform'
import { mountChartPlugins } from '@/plugin'

import { translateTimezone } from '@/widget/timezone-modal/data'

import { type Period, type AstroneumOptions, type AstroneumHandle, type SerializedChartState } from '@/types'

import { useChartStore } from '@/store/chartStore'
import { useIndicatorStore } from '@/store/indicatorStore'
import { useUIStore, EMPTY_INDICATOR_SETTING, type LineStyleEntry } from '@/store/uiStore'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getSystemTheme(): 'dark' | 'light' {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function createLogoNode(): Node {
  const div = document.createElement('div')
  div.innerHTML = logoSvgRaw
  const svg = div.firstElementChild as SVGElement
  svg.classList.add('logo')
  return svg
}

const DEFAULT_PERIODS: Period[] = [
  { multiplier: 1, timespan: 'minute', text: '1m' },
  { multiplier: 5, timespan: 'minute', text: '5m' },
  { multiplier: 15, timespan: 'minute', text: '15m' },
  { multiplier: 1, timespan: 'hour', text: '1H' },
  { multiplier: 2, timespan: 'hour', text: '2H' },
  { multiplier: 4, timespan: 'hour', text: '4H' },
  { multiplier: 1, timespan: 'day', text: 'D' },
  { multiplier: 1, timespan: 'week', text: 'W' },
  { multiplier: 1, timespan: 'month', text: 'M' },
  { multiplier: 1, timespan: 'year', text: 'Y' }
]

const DEFAULT_MAIN_INDICATORS = [{ name: 'EMA', calcParams: [7, 25, 99] }]

// ---------------------------------------------------------------------------
// Local component-scoped types
// ---------------------------------------------------------------------------
interface IndicatorTooltipFeatureClickData {
  paneId: string
  indicator: { name: string; visible: boolean }
  feature: { id: string }
}

export type AstroneumChartProps = AstroneumOptions

function makeTooltipFeatures(color: string): TooltipFeatureStyle[] {
  const base: Omit<TooltipFeatureStyle, 'id' | 'marginLeft' | 'content'> = {
    position: 'middle',
    marginTop: 3,
    marginRight: 0,
    marginBottom: 3,
    paddingLeft: 0,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    size: 14,
    color,
    activeColor: color,
    backgroundColor: 'transparent',
    activeBackgroundColor: 'rgba(22, 119, 255, 0.15)',
    borderRadius: 2,
    type: 'icon_font'
  }
  const makeFeature = (id: string, code: string, marginLeft: number): TooltipFeatureStyle => ({
    ...base, id, marginLeft, content: { family: 'icomoon', code }
  })
  return [
    makeFeature('visible', '\ue903', 8),
    makeFeature('invisible', '\ue901', 8),
    makeFeature('setting', '\ue902', 6),
    makeFeature('close', '\ue900', 6)
  ]
}

const TOOLTIP_FEATURES_LIGHT = makeTooltipFeatures('#76808F')
const TOOLTIP_FEATURES_DARK = makeTooltipFeatures('#929AA5')

const TOOLTIP_STYLES_LIGHT = { indicator: { tooltip: { features: TOOLTIP_FEATURES_LIGHT } } }
const TOOLTIP_STYLES_DARK = { indicator: { tooltip: { features: TOOLTIP_FEATURES_DARK } } }

const MS_PER: Partial<Record<Period['timespan'], number>> = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000
} as const

function adjustFromTo(period: Period, toTimestamp: number, count: number): [from: number, to: number] {
  const unit = MS_PER[period.timespan]
  if (unit) {
    const to = toTimestamp - (toTimestamp % unit)
    return [to - count * period.multiplier * unit, to]
  }
  if (period.timespan === 'week') {
    // Pure integer week alignment — epoch 1970-01-01 was a Thursday.
    // Shift by 3 days so Monday=0, then floor-align to week start.
    const dayMs = 86_400_000
    const weekMs = 7 * dayMs
    const mondayEpoch = 3 * dayMs  // Days from Unix epoch to first Monday
    const alignedMs = toTimestamp + mondayEpoch
    const to = alignedMs - (alignedMs % weekMs) - mondayEpoch
    return [to - count * period.multiplier * weekMs, to]
  }
  if (period.timespan === 'month') {
    // Use Date.UTC directly — avoids intermediate Date objects.
    const d = new Date(toTimestamp)
    const to = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
    const months = d.getUTCFullYear() * 12 + d.getUTCMonth() - count * period.multiplier
    const from = Date.UTC(Math.floor(months / 12), months % 12, 1)
    return [from, to]
  }
  // year
  const d = new Date(toTimestamp)
  const to = Date.UTC(d.getUTCFullYear(), 0, 1)
  const from = Date.UTC(d.getUTCFullYear() - count * period.multiplier, 0, 1)
  return [from, to]
}

function createIndicator(widget: Nullable<Chart>, indicator: IndicatorDef, isStack?: boolean, paneOptions?: PaneOptions): Nullable<string> {
  return widget?.createIndicator({
    name: indicator.name,
    calcParams: indicator.calcParams,
    createTooltipDataSource: ({ chart, indicator }) => {
      const features = chart.getStyles().indicator.tooltip.features
      const selected = indicator.visible
        ? [features[1], features[2], features[3]]
        : [features[0], features[2], features[3]]
      return { features: selected }
    }
  }, isStack, paneOptions) ?? null
}

const AstroneumChart = forwardRef<AstroneumHandle, AstroneumChartProps>((props, ref) => {
  const widgetRef = useRef<Chart | null>(null)
  const widgetContainerRef = useRef<HTMLDivElement | null>(null)
  const snapperRef = useRef<DrawingSnapper | null>(null)
  const priceUnitDomRef = useRef<HTMLElement | null>(null)
  const ariaLiveRef = useRef<HTMLDivElement | null>(null)

  // ---------------------------------------------------------------------------
  // Focused stores — each slice owns a single concern
  // ---------------------------------------------------------------------------
  const initialTheme = props.theme ?? getSystemTheme()
  const initialLocale = props.locale ?? 'en-US'
  const initialTimezone = props.timezone ?? 'Asia/Shanghai'

  const chart = useChartStore({
    theme: initialTheme,
    locale: initialLocale,
    symbol: props.symbol,
    period: props.period,
    timezone: { key: initialTimezone, text: translateTimezone(initialTimezone, initialLocale) },
    styles: props.styles ?? {}
  })
  const indicators = useIndicatorStore({ mainIndicators: props.mainIndicators ?? DEFAULT_MAIN_INDICATORS })
  const ui = useUIStore({ drawingBarVisible: props.drawingBarVisible ?? true })
  const [alertModalVisible, setAlertModalVisible] = useState(false)
  const [scriptEditorModalVisible, setScriptEditorModalVisible] = useState(false)

  // Sync controlled props from parent into internal chart store.
  useEffect(() => {
    const current = chart.period()
    if (
      current.multiplier !== props.period.multiplier ||
      current.timespan !== props.period.timespan ||
      current.text !== props.period.text
    ) {
      chart.setPeriod(props.period)
    }
  }, [props.period])

  useEffect(() => {
    const current = chart.symbol()
    if (
      current.ticker !== props.symbol.ticker ||
      current.pricePrecision !== props.symbol.pricePrecision ||
      current.volumePrecision !== props.symbol.volumePrecision
    ) {
      chart.setSymbol(props.symbol)
    }
  }, [props.symbol])

  useEffect(() => {
    if (props.theme !== undefined && chart.theme() !== props.theme) {
      chart.setTheme(props.theme)
    }
  }, [props.theme])

  useEffect(() => {
    if (props.locale !== undefined && chart.locale() !== props.locale) {
      chart.setLocale(props.locale)
    }
  }, [props.locale])

  useEffect(() => {
    if (props.timezone !== undefined && chart.timezone().key !== props.timezone) {
      chart.setTimezone({ key: props.timezone, text: translateTimezone(props.timezone, chart.locale()) })
    }
  }, [props.timezone])

  useEffect(() => {
    if (props.styles !== undefined) {
      chart.setStyles(props.styles)
    }
  }, [props.styles])

  const clockTime = useClockTick()
  useKeyboardShortcuts(widgetRef)

  // chart.* getters are stable useCallback refs — stable identity, empty deps is intentional
  useImperativeHandle(ref, () => ({
    setTheme: chart.setTheme,
    getTheme: () => chart.theme(),
    setStyles: chart.setStyles,
    getStyles: () => widgetRef.current!.getStyles(),
    setLocale: chart.setLocale,
    getLocale: () => chart.locale(),
    setTimezone: (tz: string) => { chart.setTimezone({ key: tz, text: translateTimezone(tz, chart.locale()) }) },
    getTimezone: () => chart.timezone().key,
    setSymbol: chart.setSymbol,
    getSymbol: () => chart.symbol(),
    setPeriod: chart.setPeriod,
    getPeriod: () => chart.period(),
    getDataListLength: () => widgetRef.current?.getDataList().length ?? 0,
    getLastDataTimestamp: () => {
      const dataList = widgetRef.current?.getDataList() ?? []
      return dataList.length > 0 ? (dataList[dataList.length - 1].timestamp ?? null) : null
    },
    serializeState: (): SerializedChartState => {
      const widget = widgetRef.current
      const overlays = widget
        ? widget.getOverlays().map(o => ({
          name: o.name,
          points: o.points,
          styles: o.styles,
          lock: o.lock,
          visible: o.visible,
        }))
        : []
      return {
        version: 1,
        theme: chart.theme(),
        locale: chart.locale(),
        timezone: chart.timezone().key,
        symbol: chart.symbol(),
        period: chart.period(),
        styles: structuredClone(chart.styles() ?? {}),
        mainIndicators: indicators.mainIndicators().map(i => ({ ...i })),
        subIndicators: Object.keys(indicators.subIndicators()),
        overlays,
      }
    },
    loadState: (state: SerializedChartState): void => {
      const widget = widgetRef.current
      if (state.version !== 1) {
        // Forward-compatible: ignore states from a newer format we don't understand.
        return
      }
      chart.setTheme(state.theme)
      chart.setLocale(state.locale)
      chart.setTimezone({ key: state.timezone, text: translateTimezone(state.timezone, state.locale) })
      chart.setSymbol(state.symbol)
      chart.setPeriod(state.period)
      if (state.styles) chart.setStyles(state.styles)
      if (!widget) return
      // Replace overlays: drop existing user drawings, then recreate.
      widget.removeOverlay()
      for (const o of state.overlays) {
        widget.createOverlay({
          name: o.name,
          points: o.points as never,
          styles: o.styles as never,
          lock: o.lock,
          visible: o.visible,
        })
      }
    },
    onCrosshairMove: (callback: (data: unknown) => void): () => void => {
      const widget = widgetRef.current
      if (!widget) return () => { }
      // Store callback so we can unsubscribe later via subscription ID
      widget.subscribeAction('onCrosshairChange', callback)
      return () => { widget.unsubscribeAction('onCrosshairChange', callback) }
    },
    setCrosshair: (data: unknown): void => {
      widgetRef.current?.executeAction('onCrosshairChange', data as never)
    },
    lockAllDrawings: (locked: boolean): void => {
      const widget = widgetRef.current
      if (!widget) return
      const overlays = widget.getOverlays()
      for (const o of overlays) {
        widget.overrideOverlay({ id: o.id, lock: locked })
      }
    },
  }), [])

  const resizeFrameRef = useRef<number | null>(null)
  const documentResize = (): void => {
    if (resizeFrameRef.current !== null) return
    resizeFrameRef.current = requestAnimationFrame(() => {
      resizeFrameRef.current = null
      widgetRef.current?.resize()
    })
  }

  useEffect(() => {
    const widgetContainer = widgetContainerRef.current
    if (!widgetContainer) {
      return
    }

    window.addEventListener('resize', documentResize)

    const widget = init(widgetContainer, {
      formatter: {
        formatDate: ({ dateTimeFormat, timestamp, template, type }) => {
          const p = chart.period()
          switch (p.timespan) {
            case 'minute': {
              if (type === 'xAxis') {
                return utils.formatDate(dateTimeFormat, timestamp, 'HH:mm')
              }
              return utils.formatDate(dateTimeFormat, timestamp, 'YYYY-MM-DD HH:mm')
            }
            case 'hour': {
              if (type === 'xAxis') {
                return utils.formatDate(dateTimeFormat, timestamp, 'MM-DD HH:mm')
              }
              return utils.formatDate(dateTimeFormat, timestamp, 'YYYY-MM-DD HH:mm')
            }
            case 'day':
            case 'week': return utils.formatDate(dateTimeFormat, timestamp, 'YYYY-MM-DD')
            case 'month': {
              if (type === 'xAxis') {
                return utils.formatDate(dateTimeFormat, timestamp, 'YYYY-MM')
              }
              return utils.formatDate(dateTimeFormat, timestamp, 'YYYY-MM-DD')
            }
            case 'year': {
              if (type === 'xAxis') {
                return utils.formatDate(dateTimeFormat, timestamp, 'YYYY')
              }
              return utils.formatDate(dateTimeFormat, timestamp, 'YYYY-MM-DD')
            }
          }
          return utils.formatDate(dateTimeFormat, timestamp, template)
        }
      }
    })
    widgetRef.current = widget

    const disposePlugins = widget ? mountChartPlugins(widget, props.plugins ?? []) : null

    if (widget) {
      const watermarkContainer = widget.getDom('candle_pane', 'main')
      if (watermarkContainer) {
        const watermarkNode = props.watermark ?? createLogoNode()
        const watermarkEl = document.createElement('div')
        watermarkEl.className = 'astroneum-watermark'
        if (utils.isString(watermarkNode)) {
          watermarkEl.textContent = watermarkNode.trim()
        } else {
          watermarkEl.appendChild(watermarkNode)
        }
        watermarkContainer.appendChild(watermarkEl)
      }

      const priceUnitContainer = widget.getDom('candle_pane', 'yAxis')
      const priceUnitDom = document.createElement('span')
      priceUnitDom.className = 'astroneum-price-unit'
      priceUnitContainer?.appendChild(priceUnitDom)
      priceUnitDomRef.current = priceUnitDom
    }

    indicators.mainIndicators().forEach(indicator => {
      createIndicator(widget, indicator, true, { id: 'candle_pane' })
    })
    const subIndicatorMap: Record<string, string> = {}
      ; (props.subIndicators ?? ['VOL']).forEach(indicator => {
        const paneId = createIndicator(widget, { name: indicator }, true)
        if (paneId) {
          subIndicatorMap[indicator] = paneId
        }
      })
    indicators.setSubIndicators(subIndicatorMap)

    const dataLoader: DataLoader = {
      getBars: async ({ type, timestamp, symbol: sym, period: per, callback }) => {
        ui.setLoadingVisible(true)
        try {
          if (type === 'init') {
            const [from, to] = adjustFromTo(per, Date.now(), 500)
            let dataList = await props.datafeed.getHistoryData(sym, per, from, to)
            if (props.barStyle === 'heikin_ashi') dataList = heikinAshi(dataList)
            if (props.priceScale && props.priceScale !== 'linear') dataList = transformCandles(dataList, props.priceScale)
            callback(dataList, dataList.length > 0)
          } else if (type === 'forward') {
            const [to] = adjustFromTo(per, timestamp!, 1)
            const [from] = adjustFromTo(per, to, 500)
            let dataList = await props.datafeed.getHistoryData(sym, per, from, to)
            if (props.barStyle === 'heikin_ashi') dataList = heikinAshi(dataList)
            if (props.priceScale && props.priceScale !== 'linear') dataList = transformCandles(dataList, props.priceScale)
            callback(dataList, dataList.length > 0)
          }
        } finally {
          ui.setLoadingVisible(false)
        }
      },
      subscribeBar: ({ symbol, period, callback }) => {
        props.datafeed.subscribe(symbol, period, callback)
      },
      unsubscribeBar: ({ symbol, period }) => {
        props.datafeed.unsubscribe(symbol, period)
      }
    }
    widget?.setDataLoader(dataLoader)

    // Accessibility: announce crosshair OHLCV via a polite aria-live region
    // so screen-reader users can read the bar under the cursor. Off unless
    // `accessible` is true. Sampled at most ~10/s to avoid flooding AT
    // queues; expanded panes that don't carry candle data emit no update.
    if (props.accessible) {
      let lastAnnounce = 0
      // Reusable buffer to avoid per-move template-string allocation
      const buf: string[] = []
      widget?.subscribeAction('onCrosshairChange', (data: unknown) => {
        const node = ariaLiveRef.current
        if (!node) return
        const now = performance.now()
        if (now - lastAnnounce < 100) return
        lastAnnounce = now
        const c = data as { kindsData?: Record<string, { open?: number; high?: number; low?: number; close?: number; volume?: number; timestamp?: number }> } | null
        const candle = c?.kindsData?.candle_pane
        if (!candle || candle.open === undefined) {
          node.textContent = ''
          return
        }
        const fmt = (v?: number): string => v === undefined ? '—' : String(v)
        buf.length = 0
        buf.push(chart.symbol().ticker, ' ', chart.period().text, ', ',
          'open ', fmt(candle.open), ', high ', fmt(candle.high), ', ',
          'low ', fmt(candle.low), ', close ', fmt(candle.close), ', ',
          'volume ', fmt(candle.volume))
        node.textContent = buf.join('')
      })
    }

    widget?.subscribeAction('onIndicatorTooltipFeatureClick', (data: unknown) => {
      const { paneId, indicator, feature } = data as IndicatorTooltipFeatureClickData
      if (indicator) {
        switch (feature.id) {
          case 'visible': {
            widget?.overrideIndicator({ name: indicator.name, paneId, visible: true })
            break
          }
          case 'invisible': {
            widget?.overrideIndicator({ name: indicator.name, paneId, visible: false })
            break
          }
          case 'setting': {
            const ind = widget?.getIndicators({ paneId, name: indicator.name })?.[0]
            const rawParams = ind?.calcParams ?? []
            const defaultLines: Array<{ color: string; show?: boolean }> = widget?.getStyles().indicator.lines ?? []
            const indLines = ind?.styles?.lines ?? []
            const lineStyles: LineStyleEntry[] = defaultLines.map((dl, i) => ({
              color: indLines[i]?.color ?? dl.color,
              show: indLines[i]?.show !== false
            }))
            ui.setIndicatorSettingModalParams({
              visible: true,
              indicatorName: indicator.name,
              paneId,
              calcParams: rawParams.map(p => (typeof p === 'number' ? p : Number(p))),
              lineStyles
            })
            break
          }
          case 'close': {
            if (paneId === 'candle_pane') {
              const newMainIndicators = [...indicators.mainIndicators()]
              widget?.removeIndicator({ paneId, name: indicator.name })
              newMainIndicators.splice(newMainIndicators.findIndex(i => i.name === indicator.name), 1)
              indicators.setMainIndicators(newMainIndicators)
            } else {
              const newInds: Record<string, string> = { ...indicators.subIndicators() }
              widget?.removeIndicator({ paneId, name: indicator.name })
              delete newInds[indicator.name]
              indicators.setSubIndicators(newInds)
            }
          }
        }
      }
    })

    return () => {
      window.removeEventListener('resize', documentResize)
      snapperRef.current?.disable()
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current)
        resizeFrameRef.current = null
      }
      disposePlugins?.()
      dispose(widgetContainer)
      widgetRef.current = null
    }
  }, [])

  // mainIndicators / subIndicators are applied once at mount (above). Keep the
  // chart in step when the props change afterwards. Only names that entered or
  // left the props are touched, so indicators added through the indicator
  // modal are left alone.
  const appliedMainRef = useRef<IndicatorDef[]>(props.mainIndicators ?? DEFAULT_MAIN_INDICATORS)
  const appliedSubRef = useRef<string[]>(props.subIndicators ?? ['VOL'])
  const mainIndicatorsKey = JSON.stringify(props.mainIndicators ?? null)
  const subIndicatorsKey = (props.subIndicators ?? ['VOL']).join(',')

  useEffect(() => {
    const widget = widgetRef.current
    if (!widget || props.mainIndicators === undefined) return
    const next = props.mainIndicators
    const prev = appliedMainRef.current
    appliedMainRef.current = next
    const signature = (i: IndicatorDef): string => `${i.name}:${(i.calcParams ?? []).join(',')}`
    const nextSignatures = new Set(next.map(signature))
    const prevSignatures = new Set(prev.map(signature))
    const removed = prev.filter(i => !nextSignatures.has(signature(i)))
    const added = next.filter(i => !prevSignatures.has(signature(i)))
    if (removed.length === 0 && added.length === 0) return
    removed.forEach(i => { widget.removeIndicator({ paneId: 'candle_pane', name: i.name }) })
    added.forEach(i => { createIndicator(widget, i, true, { id: 'candle_pane' }) })
    const removedNames = new Set(removed.map(i => i.name))
    indicators.setMainIndicators([
      ...indicators.mainIndicators().filter(i => !removedNames.has(i.name)),
      ...added
    ])
  }, [mainIndicatorsKey])

  useEffect(() => {
    const widget = widgetRef.current
    if (!widget) return
    const next = props.subIndicators ?? ['VOL']
    const prev = appliedSubRef.current
    appliedSubRef.current = next
    // The store maps name -> id returned by createIndicator, which is the
    // indicator id (not the pane id), so removal goes by id.
    const ids = { ...indicators.subIndicators() }
    let changed = false
    prev.filter(name => !next.includes(name)).forEach(name => {
      const id = ids[name]
      if (id) {
        widget.removeIndicator({ id })
        delete ids[name]
        changed = true
      }
    })
    next.filter(name => !prev.includes(name) && !(name in ids)).forEach(name => {
      const id = createIndicator(widget, { name }, true)
      if (id) {
        ids[name] = id
        changed = true
      }
    })
    if (changed) indicators.setSubIndicators(ids)
  }, [subIndicatorsKey])

  const symbol = chart.symbol()
  const period = chart.period()
  const theme = chart.theme()
  const locale = chart.locale()
  const timezone = chart.timezone()
  const styles = chart.styles()

  // Batch all engine property syncs into one effect so multiple prop changes
  // (e.g. symbol + period + theme during loadState) trigger a single render pass.
  useEffect(() => {
    const widget = widgetRef.current
    if (!widget) return

    // Price unit label
    const priceUnitDom = priceUnitDomRef.current
    if (priceUnitDom) {
      if (symbol?.priceCurrency) {
        priceUnitDom.textContent = symbol.priceCurrency.toLocaleUpperCase()
        priceUnitDom.style.display = 'flex'
      } else {
        priceUnitDom.style.display = 'none'
      }
    }

    widget.setSymbol({
      ticker: symbol.ticker,
      pricePrecision: symbol.pricePrecision ?? 2,
      volumePrecision: symbol.volumePrecision ?? 0
    })
    widget.setPeriod(period)
    widget.setStyles(theme)
    widget.setStyles(theme === 'dark' ? TOOLTIP_STYLES_DARK : TOOLTIP_STYLES_LIGHT)
    widget.setLocale(locale)
    widget.setTimezone(timezone.key)
    if (styles) {
      widget.setStyles(styles)
      chart.setWidgetDefaultStyles(deepClone(widget.getStyles()))
    }
  }, [symbol, period, theme, locale, timezone, styles])

  return (
    <div
      className={`astroneum${props.className ? ` ${props.className}` : ''}`}
      data-theme={theme}
      style={props.style}
      {...(props.accessible ? {
        tabIndex: 0,
        role: 'img' as const,
        'aria-label': props.ariaLabel ?? `${symbol.ticker} ${period.text} chart`,
      } : {})}
    >
      {props.accessible && (
        <div
          ref={(el) => { ariaLiveRef.current = el }}
          className='astroneum-sr-only'
          role='status'
          aria-live='polite'
          aria-atomic='true'
        />
      )}
      <i className="icon-close astroneum-load-icon" />
      {ui.symbolSearchModalVisible() && (
        <SymbolSearchModal
          locale={locale}
          searchSymbols={props.datafeed.searchSymbols.bind(props.datafeed)}
          onSymbolSelected={s => { chart.setSymbol(s) }}
          onClose={() => { ui.setSymbolSearchModalVisible(false) }} />
      )}
      {ui.indicatorModalVisible() && (
        <IndicatorModal
          locale={locale}
          mainIndicators={indicators.mainIndicators()}
          subIndicators={indicators.subIndicators()}
          onClose={() => { ui.setIndicatorModalVisible(false) }}
          onMainIndicatorChange={data => {
            const newMain = [...indicators.mainIndicators()]
            if (data.added) {
              createIndicator(widgetRef.current, { name: data.name }, true, { id: 'candle_pane' })
              newMain.push({ name: data.name })
            } else {
              widgetRef.current?.removeIndicator({ paneId: 'candle_pane', name: data.name })
              newMain.splice(newMain.findIndex(i => i.name === data.name), 1)
            }
            indicators.setMainIndicators(newMain)
          }}
          onSubIndicatorChange={data => {
            const newSub: Record<string, string> = { ...indicators.subIndicators() }
            if (data.added) {
              const paneId = createIndicator(widgetRef.current, { name: data.name })
              if (paneId) {
                newSub[data.name] = paneId
              }
            } else {
              if (data.paneId) {
                widgetRef.current?.removeIndicator({ id: data.paneId })
                delete newSub[data.name]
              }
            }
            indicators.setSubIndicators(newSub)
          }} />
      )}
      {ui.timezoneModalVisible() && (
        <TimezoneModal
          locale={locale}
          timezone={chart.timezone()}
          onClose={() => { ui.setTimezoneModalVisible(false) }}
          onConfirm={chart.setTimezone}
        />
      )}
      {ui.settingModalVisible() && (
        <SettingModal
          locale={locale}
          currentStyles={utils.clone(widgetRef.current!.getStyles())}
          onClose={() => { ui.setSettingModalVisible(false) }}
          onChange={style => {
            widgetRef.current?.setStyles(style)
          }}
          onRestoreDefault={(options: SelectDataSourceItem[]) => {
            const style = {}
            options.forEach(option => {
              const key = option.key
              deepSet(style, key, utils.formatValue(chart.widgetDefaultStyles(), key))
            })
            widgetRef.current?.setStyles(style)
          }}
        />
      )}
      {ui.screenshotUrl().length > 0 && (
        <ScreenshotModal
          locale={locale}
          url={ui.screenshotUrl()}
          onClose={() => { ui.setScreenshotUrl('') }}
        />
      )}
      {ui.indicatorSettingModalParams().visible && (
        <IndicatorSettingModal
          locale={locale}
          params={ui.indicatorSettingModalParams()}
          onClose={() => { ui.setIndicatorSettingModalParams(EMPTY_INDICATOR_SETTING) }}
          onConfirm={(params, lineStyles) => {
            const modalParams = ui.indicatorSettingModalParams()
            widgetRef.current?.overrideIndicator({
              name: modalParams.indicatorName,
              paneId: modalParams.paneId,
              calcParams: params,
              styles: lineStyles.length > 0 ? { lines: lineStyles.map(ls => ({ color: ls.color, show: ls.show })) } : null
            })
          }}
        />
      )}
      {alertModalVisible && (
        <AlertModal
          locale={locale}
          symbol={chart.symbol().ticker}
          onClose={() => { setAlertModalVisible(false) }} />
      )}
      {scriptEditorModalVisible && (
        <ScriptEditorModal
          locale={locale}
          onCompiled={indicatorName => {
            createIndicator(widgetRef.current, { name: indicatorName }, false)
          }}
          onClose={() => { setScriptEditorModalVisible(false) }} />
      )}
      <PeriodBar
        locale={locale}
        symbol={chart.symbol()}
        spread={ui.drawingBarVisible()}
        period={chart.period()}
        periods={props.periods ?? DEFAULT_PERIODS}
        onMenuClick={() => {
          startTransition(() => {
            ui.setDrawingBarVisible(v => !v)
          })
          if (resizeFrameRef.current !== null) cancelAnimationFrame(resizeFrameRef.current)
          resizeFrameRef.current = requestAnimationFrame(() => {
            resizeFrameRef.current = null
            widgetRef.current?.resize()
          })
        }}
        onSymbolClick={() => { ui.setSymbolSearchModalVisible(!ui.symbolSearchModalVisible()) }}
        onPeriodChange={chart.setPeriod}
        onIndicatorClick={() => { ui.setIndicatorModalVisible(v => !v) }}
        onTimezoneClick={() => { ui.setTimezoneModalVisible(v => !v) }}
        onSettingClick={() => { ui.setSettingModalVisible(v => !v) }}
        onAlertClick={() => { setAlertModalVisible(v => !v) }}
        onScreenshotClick={() => {
          if (widgetRef.current) {
            const url = widgetRef.current.getConvertPictureUrl(true, 'jpeg', theme === 'dark' ? '#151517' : '#ffffff')
            ui.setScreenshotUrl(url)
          }
        }}
      />
      <div className="astroneum-content">
        {ui.loadingVisible() && <Loading />}
        {ui.drawingBarVisible() && (
          <DrawingBar
            locale={locale}
            onDrawingItemClick={overlay => { widgetRef.current?.createOverlay(overlay) }}
            onModeChange={mode => { widgetRef.current?.overrideOverlay({ mode: mode as OverlayMode }) }}
            onLockChange={lock => { widgetRef.current?.overrideOverlay({ lock }) }}
            onVisibleChange={visible => { widgetRef.current?.overrideOverlay({ visible }) }}
            onRemoveClick={groupId => { widgetRef.current?.removeOverlay({ groupId }) }}
            onSnapLevelsChange={active => {
              const widget = widgetRef.current
              if (!widget) return
              if (!snapperRef.current) {
                snapperRef.current = new DrawingSnapper(widget)
              }
              if (active) {
                snapperRef.current.enable()
              } else {
                snapperRef.current.disable()
              }
            }} />
        )}
        <div
          ref={(el) => {
            widgetContainerRef.current = el
          }}
          className='astroneum-widget'
          data-drawing-bar-visible={ui.drawingBarVisible()} />
        <div className='astroneum-clock' aria-hidden='true'>{clockTime}</div>
      </div>
    </div>
  )
})
AstroneumChart.displayName = 'AstroneumChart'
export default AstroneumChart
