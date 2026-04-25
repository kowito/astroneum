import type {
  LineType, PolygonType, TooltipShowRule, TooltipShowType, FeatureType, TooltipFeaturePosition,
  CandleType, CandleTooltipRectPosition, Styles, TooltipFeatureStyle
} from './common/Styles'
import type { DataLoader, DataLoadType, DataLoaderGetBarsParams, DataLoaderSubscribeBarParams } from './common/DataLoader'
import type Nullable from './common/Nullable'
import type DeepPartial from './common/DeepPartial'
import type Coordinate from './common/Coordinate'
import type Bounding from './common/Bounding'
import type { CandleData } from './common/Data'

import { logError, logTag, logWarn } from './common/utils/logger'

let _tagLogged = false

import {
  clone, merge, isString, isNumber, isValid, isObject, isArray, isFunction, isBoolean
} from './common/utils/typeChecks'
import {
  formatValue,
  formatPrecision,
  formatBigNumber,
  formatThousands,
  formatFoldDecimal,
  formatTimestampByTemplate
} from './common/utils/format'
import { calcTextWidth } from './common/utils/canvas'
import type { ActionType } from './common/Action'
import type { IndicatorSeries, Indicator } from './component/Indicator'
import type { OverlayMode, OverlayTemplate, OverlayCreate } from './component/Overlay'
import type { PaneOptions } from './pane/types'

import type { FormatDateType, Options, ZoomAnchor } from './Options'
import ChartImp, { type Chart, type DomPosition } from './Chart'

import { checkCoordinateOnArc } from './extension/figure/arc'
import { checkCoordinateOnCircle, type CircleAttrs } from './extension/figure/circle'
import {
  checkCoordinateOnLine,
  getLinearYFromSlopeIntercept,
  getLinearSlopeIntercept,
  getLinearYFromCoordinates,
  type LineAttrs
} from './extension/figure/line'
import { checkCoordinateOnPolygon, type PolygonAttrs } from './extension/figure/polygon'
import { checkCoordinateOnRect } from './extension/figure/rect'
import { checkCoordinateOnText, type TextAttrs } from './extension/figure/text'

import { registerFigure, getSupportedFigures, getFigureClass } from './extension/figure/index'
import { registerIndicator, getSupportedIndicators } from './extension/indicator/index'
import { registerLocale, getSupportedLocales } from './extension/i18n/index'
import { registerOverlay, getOverlayClass, getSupportedOverlays } from './extension/overlay/index'
import { registerStyles } from './extension/styles/index'
import { registerXAxis } from './extension/x-axis'
import { registerYAxis } from './extension/y-axis'

const charts = new Map<string, ChartImp>()
let chartBaseId = 1

/**
 * Chart version
 * @return {string}
 */
function version (): string {
  return '__VERSION__'
}

/**
 * Init chart instance
 * @param ds
 * @param options
 * @returns {Chart}
 */
function init (ds: HTMLElement | string, options?: Options): Nullable<Chart> {
  if (!_tagLogged) { _tagLogged = true; logTag() }
  let dom: Nullable<HTMLElement> = null
  if (isString(ds)) {
    dom = document.getElementById(ds)
  } else {
    dom = ds
  }
  if (dom === null) {
    logError('', '', 'The chart cannot be initialized correctly. Please check the parameters. The chart container cannot be null and child elements need to be added!!!')
    return null
  }
  let chart = charts.get(dom.id)
  if (isValid(chart)) {
    logWarn('', '', 'The chart has been initialized on the dom！！！')
    return chart
  }
  const id = `k_line_chart_${chartBaseId++}`
  chart = new ChartImp(dom, options)
  chart.id = id
  dom.setAttribute('k-line-chart-id', id)
  charts.set(id, chart)
  return chart
}

/**
 * Destroy chart instance
 * @param dcs
 */
function dispose (dcs: HTMLElement | Chart | string): void {
  let id: Nullable<string> = null
  if (dcs instanceof ChartImp) {
    id = dcs.id
  } else {
    let dom: Nullable<HTMLElement> = null
    if (isString(dcs)) {
      dom = document.getElementById(dcs)
    } else {
      dom = dcs as HTMLElement
    }
    id = dom?.getAttribute('k-line-chart-id') ?? null
  }
  if (id !== null) {
    charts.get(id)?.destroy()
    charts.delete(id)
  }
}

const utils = {
  clone,
  merge,
  isString,
  isNumber,
  isValid,
  isObject,
  isArray,
  isFunction,
  isBoolean,
  formatValue,
  formatPrecision,
  formatBigNumber,
  formatDate: formatTimestampByTemplate,
  formatThousands,
  formatFoldDecimal,
  calcTextWidth,
  getLinearSlopeIntercept,
  getLinearYFromSlopeIntercept,
  getLinearYFromCoordinates,
  checkCoordinateOnArc,
  checkCoordinateOnCircle,
  checkCoordinateOnLine,
  checkCoordinateOnPolygon,
  checkCoordinateOnRect,
  checkCoordinateOnText
}

export {
  version, init, dispose,
  registerFigure, getSupportedFigures, getFigureClass,
  registerIndicator, getSupportedIndicators,
  registerOverlay, getSupportedOverlays, getOverlayClass,
  registerLocale, getSupportedLocales,
  registerStyles,
  registerXAxis, registerYAxis,
  utils,
  type LineType, type PolygonType, type TooltipShowRule, type TooltipShowType, type FeatureType, type TooltipFeaturePosition, type CandleTooltipRectPosition,
  type CandleType, type FormatDateType, type ZoomAnchor,
  type DomPosition, type ActionType, type IndicatorSeries, type OverlayMode,
  type CandleData, type Styles, type DeepPartial, type Nullable,
  type Chart, type PaneOptions, type Indicator,
  type OverlayTemplate, type OverlayCreate,
  type LineAttrs, type PolygonAttrs, type TextAttrs, type CircleAttrs,
  type Coordinate, type Bounding,
  type TooltipFeatureStyle,
  type DataLoader, type DataLoadType, type DataLoaderGetBarsParams, type DataLoaderSubscribeBarParams
}
