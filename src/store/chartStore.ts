import { useCallback, useRef, useState } from 'react'

import type { Styles, DeepPartial } from '@/types'
import type { SelectDataSourceItem } from '@/component'
import type { SymbolInfo, Period } from '@/types'

export interface ChartStoreInit {
  theme: string
  locale: string
  symbol: SymbolInfo
  period: Period
  timezone: SelectDataSourceItem
  styles?: DeepPartial<Styles>
}

export function createChartStore (init: ChartStoreInit) {
  const [theme, setTheme] = useState(init.theme)
  const themeRef = useRef(theme)
  themeRef.current = theme

  const [locale, setLocale] = useState(init.locale)
  const localeRef = useRef(locale)
  localeRef.current = locale

  const [symbol, setSymbol] = useState<SymbolInfo>(init.symbol)
  const symbolRef = useRef(symbol)
  symbolRef.current = symbol

  const [period, setPeriod] = useState<Period>(init.period)
  const periodRef = useRef(period)
  periodRef.current = period

  const [timezone, setTimezone] = useState<SelectDataSourceItem>(init.timezone)
  const timezoneRef = useRef(timezone)
  timezoneRef.current = timezone

  const [styles, setStyles] = useState<DeepPartial<Styles> | undefined>(init.styles)
  const stylesRef = useRef(styles)
  stylesRef.current = styles

  const [widgetDefaultStyles, setWidgetDefaultStyles] = useState<Styles | undefined>(undefined)
  const widgetDefaultStylesRef = useRef(widgetDefaultStyles)
  widgetDefaultStylesRef.current = widgetDefaultStyles

  const getTheme = useCallback(() => themeRef.current, [])
  const getLocale = useCallback(() => localeRef.current, [])
  const getSymbol = useCallback(() => symbolRef.current, [])
  const getPeriod = useCallback(() => periodRef.current, [])
  const getTimezone = useCallback(() => timezoneRef.current, [])
  const getStyles = useCallback(() => stylesRef.current, [])
  const getWidgetDefaultStyles = useCallback(() => widgetDefaultStylesRef.current, [])

  return {
    theme: getTheme, setTheme,
    locale: getLocale, setLocale,
    symbol: getSymbol, setSymbol,
    period: getPeriod, setPeriod,
    timezone: getTimezone, setTimezone,
    styles: getStyles, setStyles,
    widgetDefaultStyles: getWidgetDefaultStyles, setWidgetDefaultStyles
  }
}

export type ChartStore = ReturnType<typeof createChartStore>
