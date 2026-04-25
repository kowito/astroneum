import type { CandleData } from './common/Data'
import type DeepPartial from './common/DeepPartial'
import type { Styles } from './common/Styles'

import type { IndicatorCreate } from './component/Indicator'
import type { PaneOptions } from './pane/types'

export type FormatDateType = 'tooltip' | 'crosshair' | 'xAxis'

export interface FormatDateParams {
  dateTimeFormat: Intl.DateTimeFormat
  timestamp: number
  template: string
  type: FormatDateType
}

export type FormatDate = (params: FormatDateParams) => string

export type FormatBigNumber = (value: string | number) => string

export type ExtendTextType = 'last_price'

export interface FormatExtendTextParams {
  type: ExtendTextType
  data: CandleData
  index: number
}

export type FormatExtendText = (params: FormatExtendTextParams) => string

export interface Formatter {
  formatDate: FormatDate
  formatBigNumber: FormatBigNumber
  formatExtendText: FormatExtendText
}

export interface Locales {
  time: string
  open: string
  high: string
  low: string
  close: string
  volume: string
  change: string
  turnover: string
  second: string
  minute: string
  hour: string
  day: string
  week: string
  month: string
  year: string
  [key: string]: string
}

export type LayoutChildType = 'candle' | 'indicator' | 'xAxis'

export interface LayoutChild {
  type: LayoutChildType
  content?: Array<string | IndicatorCreate>
  options?: PaneOptions
}

export interface DecimalFold {
  threshold: number
  format: (value: string | number) => string
}

export interface ThousandsSeparator {
  sign: string
  format: (value: string | number) => string
}

export type ZoomAnchorType = 'cursor' | 'last_bar'

export interface ZoomAnchor {
  main: ZoomAnchorType
  xAxis: ZoomAnchorType
}

export interface Options {
  locale?: string
  timezone?: string
  styles?: string | DeepPartial<Styles>
  formatter?: Partial<Formatter>
  thousandsSeparator?: Partial<ThousandsSeparator>
  decimalFold?: Partial<DecimalFold>
  zoomAnchor?: ZoomAnchorType | Partial<ZoomAnchor>
  layout?: LayoutChild[]
}
