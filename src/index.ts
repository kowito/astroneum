import {
  registerIndicator,
  getSupportedIndicators,
  registerOverlay,
  getSupportedOverlays,
  registerXAxis,
  registerYAxis
} from '@/engine'

import overlays from './extension'

import DefaultDatafeed from './datafeed'
import { WebSocketDatafeed } from './datafeed/WebSocketDatafeed'
import AstroneumChart from './chart'
import MultiChartLayout from './chart/MultiChartLayout'
import BarReplay from './chart/BarReplay'
import DrawingTemplates from './chart/DrawingTemplates'
import AlertManager from './chart/AlertManager'
import ScriptEngine from './scripting/ScriptEngine'
import WatchlistManager from './chart/WatchlistManager'
import PortfolioTracker from './chart/PortfolioTracker'
import PerformanceMode from './chart/PerformanceMode'

import { load } from './i18n'
import {
  formatPrice,
  formatVolume,
  formatPercent,
  formatDate,
  formatTime,
  formatDateTime,
  formatDuration,
  formatPeriod,
  detectPricePrecision
} from './i18n/format'

import {
  createIndicatorTemplateFromPlugin,
  registerIndicatorPlugin,
  registerIndicatorPlugins
} from './plugin'

import {
  type Datafeed,
  type SymbolInfo,
  type Period,
  type DatafeedSubscribeCallback,
  type AstroneumOptions,
  type AstroneumHandle,
  type CandleData,
  type ChartPlugin,
  type ChartPluginContext
} from './types'

import './styles/index.less'

overlays.forEach(o => { registerOverlay(o) })

export {
  DefaultDatafeed,
  WebSocketDatafeed,
  AstroneumChart,
  MultiChartLayout,
  BarReplay,
  DrawingTemplates,
  AlertManager,
  ScriptEngine,
  WatchlistManager,
  PortfolioTracker,
  PerformanceMode,
  load as loadLocales,
  formatPrice,
  formatVolume,
  formatPercent,
  formatDate,
  formatTime,
  formatDateTime,
  formatDuration,
  formatPeriod,
  detectPricePrecision,
  registerIndicator,
  getSupportedIndicators,
  registerOverlay,
  getSupportedOverlays,
  registerXAxis,
  registerYAxis,
  createIndicatorTemplateFromPlugin,
  registerIndicatorPlugin,
  registerIndicatorPlugins
}

export { asPrice, asVolume, asTimestamp, rafCoalesce, rafMergeTick } from './utils'
export { EventBus } from './chart/EventBus'
export { TickAnimator } from './engine/common/TickAnimator'
export { RingBuffer } from './engine/common/RingBuffer'

export type {
  Datafeed, SymbolInfo, Period, DatafeedSubscribeCallback, AstroneumOptions, AstroneumHandle, CandleData,
  ChartPlugin, ChartPluginContext
}
export type { Viewport, IndicatorPlugin, ChartEventMap, Price, Volume, Timestamp } from './types'
export type { TickAnimatorOptions } from './engine/common/TickAnimator'
export type { WebSocketDatafeedOptions } from './datafeed/WebSocketDatafeed'

export type { MultiChartCount, MultiChartSlot, MultiChartLayoutOptions } from './chart/MultiChartLayout'
export type { BarReplayOptions, BarReplayState } from './chart/BarReplay'
export type { OverlayStylePreset, DrawingStyleTemplate } from './chart/DrawingTemplates'
export type { Alert, AlertCondition, AlertStatus, AlertFrequency, AlertCreate, AlertCheckInput, AlertTriggeredCallback } from './chart/AlertManager'
export type { FormatPriceOptions, DateFormatStyle, TimeFormatStyle } from './i18n/format'
export type { CompiledIndicator, StudyOptions, PlotOptions, InputOptions } from './scripting/ScriptEngine'
export type { Watchlist, WatchSymbol } from './chart/WatchlistManager'
export type { Position, PositionSide, PnLResult } from './chart/PortfolioTracker'
export type { Bar as PerformanceBar } from './chart/PerformanceMode'
