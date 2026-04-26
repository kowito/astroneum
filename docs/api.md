# API Reference

## Constructor

```typescript
<AstroneumChart ref={ref} {...options} />
```

### `AstroneumOptions`

| Property | Type | Required | Default | Description |
|---|---|---|---|---|
| `container` | `string \| HTMLElement` | ✓ | — | Container element or its `id` attribute |
| `symbol` | `SymbolInfo` | ✓ | — | Symbol to display on load |
| `period` | `Period` | ✓ | — | Initial timeframe |
| `datafeed` | `Datafeed` | ✓ | — | Data source implementation |
| `theme` | `'light' \| 'dark'` | | `getSystemTheme()` | UI theme. Omit to auto-detect OS color scheme. |
| `locale` | `string` | | `'en-US'` | UI locale key |
| `timezone` | `string` | | `'Asia/Shanghai'` | IANA timezone identifier for the X-axis |
| `watermark` | `string \| Node` | | Astroneum logo SVG | Watermark rendered in the chart center |
| `styles` | `DeepPartial<Styles>` | | `{}` | Deep-partial engine style override |
| `drawingBarVisible` | `boolean` | | `true` | Whether the left-side drawing toolbar is shown |
| `periods` | `Period[]` | | `[1m,5m,15m,1H,2H,4H,D,W,M,Y]` | Timeframes available in the period bar |
| `mainIndicators` | `IndicatorDef[]` | | `[{ name: 'EMA', calcParams: [7,25,99] }]` | Indicators overlaid on the main candle pane |
| `subIndicators` | `string[]` | | `['VOL']` | Indicator names rendered in sub-panes below the chart |
| `plugins` | `ChartPlugin[]` | | `[]` | Plugins mounted with chart lifecycle hooks (`onInit` / disposer) |

---

## Instance methods

### `setTheme(theme)`
```typescript
setTheme(theme: 'light' | 'dark'): void
```
Sets the UI theme. Updates both the `data-theme` attribute and the internal chart styles.

### `getTheme()`
```typescript
getTheme(): string
```
Returns the current theme name.

### `setStyles(styles)`
```typescript
setStyles(styles: DeepPartial<Styles>): void
```
Merges the given partial styles into the engine's current style tree.

### `getStyles()`
```typescript
getStyles(): Styles
```
Returns the full resolved engine style object.

### `setLocale(locale)`
```typescript
setLocale(locale: string): void
```
Switches the UI and engine locale. The locale key must have been registered with `loadLocales()` (for UI strings) and the engine's `registerLocale()` (for OHLC/indicator labels).

### `getLocale()`
```typescript
getLocale(): string
```
Returns the current locale key.

### `setTimezone(timezone)`
```typescript
setTimezone(timezone: string): void
```
Changes the IANA timezone used for the X-axis date labels.

### `getTimezone()`
```typescript
getTimezone(): string
```
Returns the current timezone.

### `setSymbol(symbol)`
```typescript
setSymbol(symbol: SymbolInfo): void
```
Loads a new symbol. Triggers a full data reload via the datafeed.

### `getSymbol()`
```typescript
getSymbol(): SymbolInfo
```
Returns the currently active `SymbolInfo`.

### `setPeriod(period)`
```typescript
setPeriod(period: Period): void
```
Switches the active timeframe. Triggers a full data reload.

### `getPeriod()`
```typescript
getPeriod(): Period
```
Returns the currently active `Period`.

---

## Exported utilities

### Brand cast helpers

```typescript
import { asPrice, asVolume, asTimestamp } from 'astroneum'

const p: Price = asPrice(100.50)
const v: Volume = asVolume(1_250_000)
const t: Timestamp = asTimestamp(Date.now())
```

These are type-safe cast functions. They assert that a plain `number` belongs to a specific financial domain without any runtime overhead.

### `rafCoalesce`

```typescript
import { rafCoalesce } from 'astroneum'

const dispatch = rafCoalesce((tick: CandleData) => chart.updateBar(tick))
webSocket.onmessage = e => dispatch(parse(e.data)) // safe to call 100×/s
```

Returns a dispatcher that schedules `fn` on the next `requestAnimationFrame`, coalescing rapid calls so only the **last** value is delivered per frame. Use this when you only care about the latest state (e.g. price display). For financial accuracy across bursts, use `rafMergeTick` instead.

### `rafMergeTick`

```typescript
import { rafMergeTick } from 'astroneum'

const cancel = rafMergeTick(incomingTick, (merged) => {
  chart.updateBar(merged)
})
// Call cancel() to stop
```

OHLCV-aware frame coalescer for WebSocket burst handling. Merges all ticks arriving within the same `requestAnimationFrame` frame into one financially accurate bar:
- `open` = first tick
- `high` = max across ticks
- `low` = min across ticks
- `close` = last tick
- `volume` = sum across ticks

### `EventBus`

```typescript
import { EventBus } from 'astroneum'
import type { ChartEventMap } from 'astroneum'

const bus = new EventBus<ChartEventMap>()

bus.on('tick', (candle) => console.log(candle.close))
bus.emit('tick', bar)
bus.off('tick', handler)
```

Zero-dependency, type-safe synchronous event bus.

### `TickAnimator`

```typescript
import { TickAnimator } from 'astroneum'
import type { TickAnimatorOptions } from 'astroneum'

const opts: TickAnimatorOptions = { duration: 120 } // ms
const animator = new TickAnimator(opts, (frame) => {
  chart.updateLastBar(frame)
})

animator.push(newTick)
animator.cancel()
```

Smooth ease-out cubic interpolation of the last bar's `close`/`high`/`low` over `duration` ms (default 120 ms). Zero allocations in the rAF loop.

### `RingBuffer`

```typescript
import { RingBuffer } from 'astroneum'

const buf = new RingBuffer<CandleData>(1000) // fixed capacity
buf.push(candle)
const arr = buf.toArray() // oldest → newest
```

Fixed-capacity O(1) circular buffer designed for streaming time-series data.

---

## Exported types

```typescript
import type {
  // Core
  AstroneumOptions,
  AstroneumHandle,
  Datafeed,
  SymbolInfo,
  Period,
  CandleData,
  DatafeedSubscribeCallback,

  // Branded primitives
  Price,
  Volume,
  Timestamp,

  // Indicator
  IndicatorDef,
  IndicatorPlugin,
  ChartPlugin,
  ChartPluginContext,

  // Events
  ChartEventMap,

  // Coordinate space
  Viewport,

  // Engine types
  Styles,
  DeepPartial,
  Coordinate,
  Bounding,

  // Utility types
  TickAnimatorOptions,
  TimeframeText,
  Timespan,

  // MultiChartLayout
  MultiChartCount,
  MultiChartSlot,
  MultiChartLayoutOptions,

  // BarReplay
  BarReplayOptions,
  BarReplayState,

  // Drawing templates
  OverlayStylePreset,
  DrawingStyleTemplate,

  // AlertManager
  Alert,
  AlertCondition,
  AlertStatus,
  AlertFrequency,
  AlertCreate,
  AlertCheckInput,
  AlertTriggeredCallback,

  // Format helpers
  FormatPriceOptions,
  DateFormatStyle,
  TimeFormatStyle,

  // ScriptEngine
  CompiledIndicator,
  StudyOptions,
  PlotOptions,
  InputOptions,

  // WatchlistManager
  Watchlist,
  WatchSymbol,

  // PortfolioTracker
  Position,
  PositionSide,
  PnLResult,

  // PerformanceMode
  PerformanceBar,
} from 'astroneum'
```

### `IndicatorDef`

```typescript
interface IndicatorDef {
  /** Registered indicator name, e.g. 'EMA', 'MA', 'RSI' */
  name: string
  /** Calculation parameters passed to the indicator engine */
  calcParams?: number[]
}
```

### `IndicatorPlugin<TOutput>`

```typescript
interface IndicatorPlugin<TOutput> {
  name: string
  shortName?: string
  calcParams?: number[]
  calc(data: CandleData[], params: number[]): TOutput[]
  render2D?(ctx: CanvasRenderingContext2D, output: TOutput[], viewport: Viewport): void
  renderGL?(gl: WebGL2RenderingContext, output: TOutput[], viewport: Viewport, vbo: WebGLBuffer): void
}
```

Implement this interface to register a custom typed indicator.  
Use `render2D` for lightweight overlays (< 10k points) and `renderGL` for high-density or GPU-accelerated rendering.
When `renderGL` is present, Astroneum executes it on a dedicated WebGL2 layer and reuses a per-indicator `vbo`.
If WebGL2 is unavailable, `render2D` is used as fallback when available.

### `registerIndicatorPlugin(plugin)`

```typescript
registerIndicatorPlugin<TOutput>(plugin: IndicatorPlugin<TOutput>): void
```

Adapts `IndicatorPlugin` to the engine `IndicatorTemplate` format and registers it.

### `registerIndicatorPlugins(plugins)`

```typescript
registerIndicatorPlugins(plugins: IndicatorPlugin<unknown>[]): void
```

Batch helper for registering multiple indicator plugins.

### `createIndicatorTemplateFromPlugin(plugin)`

```typescript
createIndicatorTemplateFromPlugin<TOutput>(plugin: IndicatorPlugin<TOutput>): IndicatorTemplate
```

Returns the converted engine template without registering it. Useful when you want manual control over registration.

### `ChartPlugin`

```typescript
interface ChartPlugin {
  name?: string
  indicators?: IndicatorPlugin<unknown>[]
  onInit?: (context: ChartPluginContext) => void | (() => void)
}
```

`indicators` are registered before chart indicator creation begins. `onInit` runs once after chart initialization and may return a disposer called during chart teardown.

### `ChartPluginContext`

```typescript
interface ChartPluginContext {
  chart: Chart
  registerIndicatorPlugin: (plugin: IndicatorPlugin<unknown>) => void
  registerIndicatorPlugins: (plugins: IndicatorPlugin<unknown>[]) => void
}
```

### `ChartEventMap`

```typescript
interface ChartEventMap {
  'symbol-change': SymbolInfo
  'period-change': Period
  'crosshair-move': Coordinate | null
  'zoom': { scale: number; anchor: ZoomAnchor }
  'data-load': { type: 'init' | 'forward' | 'backward'; count: number }
  'tick': CandleData
  'drawing-start': string
  'drawing-end': string
  'theme-change': string
}
```

### `Viewport`

```typescript
interface Viewport {
  priceMin: Price
  priceMax: Price
  timeMin: Timestamp
  timeMax: Timestamp
  resolution: readonly [width: number, height: number]
}
```

Represents the currently visible region of the chart canvas. Used for coordinate-space transforms in custom `IndicatorPlugin` renderers.

---

## Additional exports

| Export | Description |
|---|---|
| `DefaultDatafeed` | Polygon.io REST + WebSocket datafeed |
| `MultiChartLayout` | Multi-chart layout manager |
| `BarReplay` | Historical bar replay engine |
| `DrawingTemplates` | Save/load drawing style templates |
| `AlertManager` | Price alert creation and monitoring |
| `ScriptEngine` | Pine-like indicator scripting sandbox (`compile()` auto-registers indicators) |
| `registerIndicator` | Register a raw engine `IndicatorTemplate` |
| `getSupportedIndicators` | List all registered indicator names |
| `registerOverlay` | Register a raw engine `OverlayTemplate` |
| `getSupportedOverlays` | List all registered overlay names |
| `registerXAxis` / `registerYAxis` | Register custom axis templates |
| `registerIndicatorPlugin` | Register a typed `IndicatorPlugin` via adapter |
| `registerIndicatorPlugins` | Batch register typed indicator plugins |
| `createIndicatorTemplateFromPlugin` | Convert `IndicatorPlugin` to engine template |
| `WatchlistManager` | Symbol watchlist with live prices |
| `PortfolioTracker` | Position tracking and P&L calculation |
| `PerformanceMode` | Reduced-render performance optimization |
| `loadLocales` | Register UI locale strings |
| `formatPrice` | Format a price number using symbol precision |
| `formatVolume` | Format a volume number |
| `formatPercent` | Format a percentage value |
| `formatDate` / `formatTime` / `formatDateTime` | Date/time formatting helpers |
| `formatDuration` | Format a duration in milliseconds as human-readable text |
| `formatPeriod` | Format a `Period` as a human-readable string (e.g. `'1H'`) |
| `detectPricePrecision` | Auto-detect decimal precision from price data |

