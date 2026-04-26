import type { CandleData, Styles, DeepPartial, Nullable } from '@/engine'
import type { Chart, DomPosition } from '@/engine'
import type { PaneOptions } from '@/engine'
import type { ActionType } from '@/engine'
import type { IndicatorSeries, Indicator } from '@/engine'
import type { OverlayMode, OverlayTemplate, OverlayCreate } from '@/engine'
import type { Coordinate, Bounding } from '@/engine'
import type { LineAttrs, PolygonAttrs, TextAttrs, CircleAttrs } from '@/engine'
import type { TooltipFeatureStyle, LineType, PolygonType, TooltipShowRule, TooltipShowType, FeatureType, TooltipFeaturePosition, CandleType, CandleTooltipRectPosition } from '@/engine'
import type { DataLoader, DataLoadType, DataLoaderGetBarsParams, DataLoaderSubscribeBarParams } from '@/engine'
import type { FormatDateType, ZoomAnchor } from '@/engine'

export type { CandleData, Styles, DeepPartial, Nullable }
export type { Chart, DomPosition }
export type { PaneOptions }
export type { ActionType }
export type { IndicatorSeries, Indicator }
export type { OverlayMode, OverlayTemplate, OverlayCreate }
export type { Coordinate, Bounding }
export type { LineAttrs, PolygonAttrs, TextAttrs, CircleAttrs }
export type { TooltipFeatureStyle, LineType, PolygonType, TooltipShowRule, TooltipShowType, FeatureType, TooltipFeaturePosition, CandleType, CandleTooltipRectPosition }
export type { DataLoader, DataLoadType, DataLoaderGetBarsParams, DataLoaderSubscribeBarParams }
export type { FormatDateType, ZoomAnchor }

// ---------------------------------------------------------------------------
// Financial primitive brands — never mix raw numbers across domains
// ---------------------------------------------------------------------------
export type Price = number & { readonly _brand: 'Price' }
export type Volume = number & { readonly _brand: 'Volume' }
export type Timestamp = number & { readonly _brand: 'Timestamp' }

// ---------------------------------------------------------------------------
// Indicator definition — supports named defaults with calc params
// ---------------------------------------------------------------------------
export interface IndicatorDef {
  name: string
  calcParams?: number[]
}

// ---------------------------------------------------------------------------
// Template literal types for domain encoding
// ---------------------------------------------------------------------------
/** Human-readable timeframe label, e.g. "1m", "4H", "1D" */
export type TimeframeText = `${number}${'m' | 'h' | 'H' | 'd' | 'D' | 'w' | 'W' | 'M' | 'Y'}`

/** Canonical timespan identifiers — aligned with engine PeriodType */
export type Timespan = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'

// ---------------------------------------------------------------------------
// Core domain types
// ---------------------------------------------------------------------------
export interface SymbolInfo {
  ticker: string
  name?: string
  shortName?: string
  exchange?: string
  market?: string
  pricePrecision?: number
  volumePrecision?: number
  priceCurrency?: string
  type?: string
  logo?: string
  [key: string]: unknown
}

export interface Period {
  multiplier: number
  /** Canonical timespan — maps directly to engine PeriodType */
  timespan: Timespan
  text: string
}

export type DatafeedSubscribeCallback = (data: CandleData) => void

export interface Datafeed {
  searchSymbols(search?: string): Promise<SymbolInfo[]>
  getHistoryData(symbol: SymbolInfo, period: Period, from: number, to: number): Promise<CandleData[]>
  subscribe(symbol: SymbolInfo, period: Period, callback: DatafeedSubscribeCallback): void
  unsubscribe(symbol: SymbolInfo, period: Period): void
}

export interface ChartProOptions {
  styles?: DeepPartial<Styles>
  watermark?: string | Node
  theme?: string
  locale?: string
  drawingBarVisible?: boolean
  symbol: SymbolInfo
  period: Period
  periods?: Period[]
  timezone?: string
  mainIndicators?: IndicatorDef[]
  subIndicators?: string[]
  plugins?: ChartPlugin[]
  datafeed: Datafeed
}

export interface ChartPro {
  setTheme(theme: string): void
  getTheme(): string
  setStyles(styles: DeepPartial<Styles>): void
  getStyles(): Styles
  setLocale(locale: string): void
  getLocale(): string
  setTimezone(timezone: string): void
  getTimezone(): string
  setSymbol(symbol: SymbolInfo): void
  getSymbol(): SymbolInfo
  setPeriod(period: Period): void
  getPeriod(): Period
}

// ---------------------------------------------------------------------------
// Viewport — represents the currently visible region of the chart canvas.
// Used for coordinate-space transforms and indicator custom renderers.
// ---------------------------------------------------------------------------
export interface Viewport {
  /** Minimum (bottom) visible price in canvas coordinates. */
  priceMin: Price
  /** Maximum (top) visible price in canvas coordinates. */
  priceMax: Price
  /** Earliest visible candle timestamp (ms). */
  timeMin: Timestamp
  /** Latest visible candle timestamp (ms). */
  timeMax: Timestamp
  /** Physical canvas resolution [width, height] in device pixels. */
  resolution: readonly [width: number, height: number]
}

// ---------------------------------------------------------------------------
// IndicatorPlugin — implement to register a custom typed indicator.
// Choose render method based on point count:
//   render2D   → suitable for < 10k points (Canvas 2D API)
//   renderGL   → required for 100k+ points or sub-pixel smooth lines (WebGL2)
// ---------------------------------------------------------------------------
export interface IndicatorPlugin<TOutput> {
  /** Unique registry name — used as the indicator identifier in the engine. */
  name: string
  /** Short display name shown in the chart legend. */
  shortName?: string
  /** Default calculation parameters (can be overridden by the user). */
  calcParams?: number[]
  /**
   * Pure calculation function. Must NOT mutate `data`.
   * Called on every data update; keep it fast (O(n) or better).
   */
  calc(data: CandleData[], params: number[]): TOutput[]
  /** Canvas 2D renderer — for lightweight overlays and small datasets. */
  render2D?(ctx: CanvasRenderingContext2D, output: TOutput[], viewport: Viewport): void
  /**
   * WebGL2 renderer — for high-density or GPU-accelerated rendering.
   * Astroneum reuses a stable per-indicator vbo and falls back to render2D when WebGL2 is unavailable.
   */
  renderGL?(gl: WebGL2RenderingContext, output: TOutput[], viewport: Viewport, vbo: WebGLBuffer): void
}

// ---------------------------------------------------------------------------
// Chart plugin lifecycle hooks
// ---------------------------------------------------------------------------
export interface ChartPluginContext {
  /** The chart instance mounted by Astroneum. */
  chart: Chart
  /** Register a typed indicator plugin at runtime. */
  registerIndicatorPlugin: (plugin: IndicatorPlugin<unknown>) => void
  /** Batch register typed indicator plugins at runtime. */
  registerIndicatorPlugins: (plugins: ReadonlyArray<IndicatorPlugin<unknown>>) => void
}

export interface ChartPlugin {
  /** Optional plugin label for diagnostics and debugging. */
  name?: string
  /** Indicator plugins to register before this chart starts creating indicators. */
  indicators?: ReadonlyArray<IndicatorPlugin<unknown>>
  /** Optional lifecycle hook called once after the chart is initialized. */
  onInit?: (context: ChartPluginContext) => void | (() => void)
}

// ---------------------------------------------------------------------------
// ChartEventMap — full set of events emitted by the chart.
// Use with EventBus<ChartEventMap> for type-safe subscriptions.
// ---------------------------------------------------------------------------
export interface ChartEventMap {
  /** Fired when the active symbol changes. */
  'symbol-change': SymbolInfo
  /** Fired when the active period / timeframe changes. */
  'period-change': Period
  /** Fired on every crosshair move; null when the crosshair leaves the chart. */
  'crosshair-move': Coordinate | null
  /** Fired when the user zooms the chart. */
  'zoom': { scale: number; anchor: ZoomAnchor }
  /** Fired when a historical data batch is loaded. */
  'data-load': { type: 'init' | 'forward' | 'backward'; count: number }
  /** Fired when a real-time tick arrives from the datafeed subscription. */
  'tick': CandleData
  /** Fired when the user starts drawing an overlay (value = overlay type name). */
  'drawing-start': string
  /** Fired when the user finishes drawing (value = overlay id). */
  'drawing-end': string
  /** Fired when the active theme changes (value = theme name). */
  'theme-change': string
}
