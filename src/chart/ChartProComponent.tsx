import { startTransition, forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

import { Show } from '@/react-shared'

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
import { mountChartPlugins } from '@/plugin'

import { translateTimezone } from '@/widget/timezone-modal/data'

import { type Period, type ChartProOptions, type ChartPro } from '@/types'

import { createChartStore } from '@/store/chartStore'
import { createIndicatorStore } from '@/store/indicatorStore'
import { createUIStore, EMPTY_INDICATOR_SETTING, type LineStyleEntry } from '@/store/uiStore'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getSystemTheme (): 'dark' | 'light' {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function createLogoNode (): Node {
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

export type AstroneumChartProps = ChartProOptions

function makeTooltipFeatures (color: string): TooltipFeatureStyle[] {
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
const TOOLTIP_FEATURES_DARK  = makeTooltipFeatures('#929AA5')

const MS_PER: Partial<Record<Period['timespan'], number>> = {
  minute: 60_000,
  hour:   3_600_000,
  day:    86_400_000
} as const

function adjustFromTo (period: Period, toTimestamp: number, count: number): [from: number, to: number] {
  const unit = MS_PER[period.timespan]
  if (unit) {
    const to = toTimestamp - (toTimestamp % unit)
    return [to - count * period.multiplier * unit, to]
  }
  if (period.timespan === 'week') {
    const dayMs = 86_400_000
    const toDate = new Date(toTimestamp)
    const weekDayOffset = toDate.getUTCDay() === 0 ? 6 : toDate.getUTCDay() - 1
    const to = Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), toDate.getUTCDate() - weekDayOffset)
    return [to - count * period.multiplier * 7 * dayMs, to]
  }
  if (period.timespan === 'month') {
    const toDate = new Date(toTimestamp)
    const to = Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), 1)
    const fromDate = new Date(to)
    fromDate.setUTCMonth(fromDate.getUTCMonth() - count * period.multiplier)
    return [Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), 1), to]
  }
  const toDate = new Date(toTimestamp)
  const to = Date.UTC(toDate.getUTCFullYear(), 0, 1)
  const fromDate = new Date(to)
  fromDate.setUTCFullYear(fromDate.getUTCFullYear() - count * period.multiplier)
  return [Date.UTC(fromDate.getUTCFullYear(), 0, 1), to]
}

function createIndicator (widget: Nullable<Chart>, indicator: IndicatorDef, isStack?: boolean, paneOptions?: PaneOptions): Nullable<string> {
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

const AstroneumChart = forwardRef<ChartPro, AstroneumChartProps>((props, ref) => {
  const widgetRef = useRef<Chart | null>(null)
  const widgetContainerRef = useRef<HTMLDivElement | null>(null)
  const snapperRef = useRef<DrawingSnapper | null>(null)
  const priceUnitDomRef = useRef<HTMLElement | null>(null)

  // ---------------------------------------------------------------------------
  // Focused stores — each slice owns a single concern
  // ---------------------------------------------------------------------------
  const initialTheme = props.theme ?? getSystemTheme()
  const initialLocale = props.locale ?? 'en-US'
  const initialTimezone = props.timezone ?? 'Asia/Shanghai'

  const chart = createChartStore({
    theme: initialTheme,
    locale: initialLocale,
    symbol: props.symbol,
    period: props.period,
    timezone: { key: initialTimezone, text: translateTimezone(initialTimezone, initialLocale) },
    styles: props.styles ?? {}
  })
  const indicators = createIndicatorStore({ mainIndicators: props.mainIndicators ?? DEFAULT_MAIN_INDICATORS })
  const ui = createUIStore({ drawingBarVisible: props.drawingBarVisible ?? true })
  const [alertModalVisible, setAlertModalVisible] = useState(false)
  const [scriptEditorModalVisible, setScriptEditorModalVisible] = useState(false)

  const [clockTime, setClockTime] = useState('')
  const clockIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const _updateClock = (): void => {
    const now = new Date()
    setClockTime(
      `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
    )
  }

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
    getPeriod: () => chart.period()
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

    _updateClock()
    clockIntervalRef.current = setInterval(_updateClock, 1000)
    window.addEventListener('resize', documentResize)

    // Keyboard shortcuts for drawing tools
    const handleKeyDown = (keyboardEvent: KeyboardEvent): void => {
      const tag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      if (keyboardEvent.key === 'Delete' || keyboardEvent.key === 'Backspace') {
        widget?.removeOverlay()
      } else if (keyboardEvent.key === 'Escape') {
        widget?.overrideOverlay({ isDrawEnd: true } as never)
        widget?.removeOverlay({ id: '' }) // deselect without removing
      }
    }
    document.addEventListener('keydown', handleKeyDown)

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

    // Attach keyboard cleanup ref after widget is initialized
    if (widget !== null) {
      ;(widget as unknown as Record<string, unknown>).__keyCleanup = () => {
        document.removeEventListener('keydown', handleKeyDown)
      }
    }

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
    ;(props.subIndicators ?? ['VOL']).forEach(indicator => {
      const paneId = createIndicator(widget, { name: indicator }, true)
      if (paneId) {
        subIndicatorMap[indicator] = paneId
      }
    })
    indicators.setSubIndicators(subIndicatorMap)

    const dataLoader: DataLoader = {
      getBars: async ({ type, timestamp, callback }) => {
        const sym = chart.symbol()
        const per = chart.period()
        ui.setLoadingVisible(true)
        try {
          if (type === 'init') {
            const [from, to] = adjustFromTo(per, Date.now(), 500)
            const dataList = await props.datafeed.getHistoryData(sym, per, from, to)
            callback(dataList, dataList.length > 0)
          } else if (type === 'forward') {
            const [to] = adjustFromTo(per, timestamp!, 1)
            const [from] = adjustFromTo(per, to, 500)
            const dataList = await props.datafeed.getHistoryData(sym, per, from, to)
            callback(dataList, dataList.length > 0)
          }
        } finally {
          ui.setLoadingVisible(false)
        }
      },
      subscribeBar: ({ callback }) => {
        props.datafeed.subscribe(chart.symbol(), chart.period(), callback)
      },
      unsubscribeBar: () => {
        props.datafeed.unsubscribe(chart.symbol(), chart.period())
      }
    }
    widget?.setDataLoader(dataLoader)

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
      if (clockIntervalRef.current !== null) {
        clearInterval(clockIntervalRef.current)
        clockIntervalRef.current = null
      }
      window.removeEventListener('resize', documentResize)
      snapperRef.current?.disable()
      if (widget) {
        (widget as unknown as { __keyCleanup?: () => void }).__keyCleanup?.()
      }
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current)
        resizeFrameRef.current = null
      }
      disposePlugins?.()
      dispose(widgetContainer)
      widgetRef.current = null
    }
  }, [])

  const symbol = chart.symbol()
  const period = chart.period()
  const theme = chart.theme()
  const locale = chart.locale()
  const timezone = chart.timezone()
  const styles = chart.styles()

  useEffect(() => {
    const widget = widgetRef.current
    if (!widget) {
      return
    }

    const priceUnitDom = priceUnitDomRef.current
    if (priceUnitDom) {
      if (symbol?.priceCurrency) {
        priceUnitDom.innerHTML = symbol.priceCurrency.toLocaleUpperCase()
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
  }, [symbol])

  useEffect(() => {
    widgetRef.current?.setPeriod(period)
  }, [period])

  useEffect(() => {
    const widget = widgetRef.current
    if (!widget) {
      return
    }

    widget.setStyles(theme)
    widget.setStyles({ indicator: { tooltip: { features: theme === 'dark' ? TOOLTIP_FEATURES_DARK : TOOLTIP_FEATURES_LIGHT } } })
  }, [theme])

  useEffect(() => {
    widgetRef.current?.setLocale(locale)
  }, [locale])

  useEffect(() => {
    widgetRef.current?.setTimezone(timezone.key)
  }, [timezone])

  useEffect(() => {
    const widget = widgetRef.current
    if (!widget || !styles) {
      return
    }

    widget.setStyles(styles)
    chart.setWidgetDefaultStyles(deepClone(widget.getStyles()))
  }, [styles])

  return (
    <div class='astroneum' data-theme={theme}>
      <i class="icon-close astroneum-load-icon"/>
      <Show when={ui.symbolSearchModalVisible()}>
        <SymbolSearchModal
          locale={locale}
          searchSymbols={props.datafeed.searchSymbols.bind(props.datafeed)}
          onSymbolSelected={s => { chart.setSymbol(s) }}
          onClose={() => { ui.setSymbolSearchModalVisible(false) }}/>
      </Show>
      <Show when={ui.indicatorModalVisible()}>
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
                widgetRef.current?.removeIndicator({ paneId: data.paneId, name: data.name })
                delete newSub[data.name]
              }
            }
            indicators.setSubIndicators(newSub)
          }}/>
      </Show>
      <Show when={ui.timezoneModalVisible()}>
        <TimezoneModal
          locale={locale}
          timezone={chart.timezone()}
          onClose={() => { ui.setTimezoneModalVisible(false) }}
          onConfirm={chart.setTimezone}
        />
      </Show>
      <Show when={ui.settingModalVisible()}>
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
      </Show>
      <Show when={ui.screenshotUrl().length > 0}>
        <ScreenshotModal
          locale={locale}
          url={ui.screenshotUrl()}
          onClose={() => { ui.setScreenshotUrl('') }}
        />
      </Show>
      <Show when={ui.indicatorSettingModalParams().visible}>
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
      </Show>
      <Show when={alertModalVisible}>
        <AlertModal
          locale={locale}
          symbol={chart.symbol().ticker}
          onClose={() => { setAlertModalVisible(false) }}/>
      </Show>
      <Show when={scriptEditorModalVisible}>
        <ScriptEditorModal
          locale={locale}
          onCompiled={indicatorName => {
            createIndicator(widgetRef.current, { name: indicatorName }, false)
          }}
          onClose={() => { setScriptEditorModalVisible(false) }}/>
      </Show>
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
          requestAnimationFrame(() => {
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
            const url = widgetRef.current.getConvertPictureUrl(true, 'jpeg', props.theme === 'dark' ? '#151517' : '#ffffff')
            ui.setScreenshotUrl(url)
          }
        }}
      />
      <div class="astroneum-content">
        <Show when={ui.loadingVisible()}>
          <Loading/>
        </Show>
        <Show when={ui.drawingBarVisible()}>
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
            }}/>
        </Show>
        <div
          ref={(el) => {
            widgetContainerRef.current = el
          }}
          class='astroneum-widget'
          data-drawing-bar-visible={ui.drawingBarVisible()}/>
        <div class='astroneum-clock' aria-hidden='true'>{clockTime}</div>
      </div>
    </div>
  )
})
export default AstroneumChart
