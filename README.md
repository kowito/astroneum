# Astroneum

Professional financial charting library for React applications.

[![npm version](https://img.shields.io/npm/v/astroneum)](https://www.npmjs.com/package/astroneum)
[![bundle size](https://img.shields.io/bundlephobia/minzip/astroneum)](https://bundlephobia.com/package/astroneum)
[![types](https://img.shields.io/npm/types/astroneum)](https://www.npmjs.com/package/astroneum)
[![license: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

## Features

- **Candlestick, bar, area, and line** chart types rendered via Canvas2D / WebGL2
- **20+ built-in indicators** — MA, EMA, BOLL, MACD, RSI, KDJ, and more
- **Custom indicator plugins** via `registerIndicatorPlugin` with optional WebGL2 render path
- **Drawing tools** — trend lines, Fibonacci, Gann, pitchfork, Elliott waves, and more; with snap, templates, and undo/redo
- **Off-main-thread indicator calculations** using a Web Worker pool and TypedArray column store
- **OPFS historical cache** — persists fetched bar data in the Origin Private File System for instant repeat loads
- **FlatBuffers binary codec** (`BarsCodec`) for efficient bar serialisation
- **Bar replay** mode with controllable playback speed
- **Multi-chart layout** for side-by-side symbol comparison
- **Alert manager**, **watchlist**, **portfolio tracker**
- **Script editor** — write custom indicators in a sandboxed JS environment
- **19 built-in locales**; fully customisable dark/light theme and styles
- Tree-shakeable ESM, fully typed TypeScript

---

## Install

```bash
npm install astroneum
```

`react` and `react-dom` ≥ 18 are peer dependencies.

## Runtime Requirements

- Browser (uses `window`, `document`, Canvas, WebSocket, `localStorage`)
- React 18+ or 19
- ESM-compatible bundler
- Import styles from `astroneum/style.css`

---

## Quick Start

```tsx
import { useRef } from 'react'
import { AstroneumChart, type AstroneumHandle } from 'astroneum'
import 'astroneum/style.css'

export default function App() {
  const chartRef = useRef<AstroneumHandle>(null)

  return (
    <AstroneumChart
      ref={chartRef}
      symbol={{ ticker: 'AAPL', shortName: 'AAPL', market: 'stocks' }}
      period={{ multiplier: 1, timespan: 'day', text: '1D' }}
      datafeed={myDatafeed}
      theme="dark"
      style={{ width: '100%', height: 560 }}
    />
  )
}
```

## Next.js Usage

### 1. Configure `next.config.ts`

Astroneum is an ESM-only package — add it to `transpilePackages` so Next.js bundles it correctly:

```ts
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['astroneum'],
}

export default nextConfig
```

### 2. Import the CSS globally

Add the stylesheet once in your root layout:

```tsx
// app/layout.tsx
import 'astroneum/style.css'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
```

### 3. Use the chart

The library ships with `'use client'` built in, so you can import it directly in any component file — no extra directive or dynamic import needed:

```tsx
// app/components/Chart.tsx
import { useRef } from 'react'
import { AstroneumChart, type AstroneumHandle } from 'astroneum'

export default function Chart() {
  const chartRef = useRef<AstroneumHandle>(null)

  return (
    <AstroneumChart
      ref={chartRef}
      symbol={{ ticker: 'AAPL', shortName: 'AAPL', market: 'stocks' }}
      period={{ multiplier: 1, timespan: 'day', text: '1D' }}
      datafeed={myDatafeed}
      locale="en-US"
      style={{ width: '100%', height: 560 }}
    />
  )
}
```

Then use it from any Server or Client Component page:

```tsx
// app/page.tsx
import Chart from './components/Chart'

export default function Page() {
  return <Chart />
}
```



## Datafeed Interface

Implement the `Datafeed` interface to connect any data source:

```ts
import type {
  Datafeed,
  SymbolInfo,
  Period,
  CandleData,
  DatafeedSubscribeCallback
} from 'astroneum'

const myDatafeed: Datafeed = {
  async searchSymbols(search?: string): Promise<SymbolInfo[]> {
    return []
  },
  async getHistoryData(
    symbol: SymbolInfo,
    period: Period,
    from: number,
    to: number
  ): Promise<CandleData[]> {
    // fetch and return OHLCV bars
    return []
  },
  subscribe(symbol: SymbolInfo, period: Period, callback: DatafeedSubscribeCallback): void {
    // stream realtime ticks
  },
  unsubscribe(symbol: SymbolInfo, period: Period): void {
    // stop stream
  }
}
```

**See [docs/datafeed-guide.md](docs/datafeed-guide.md) for:**
- 3 complete patterns: minimal mock → REST API → WebSocket
- Real-world examples (Binance, custom REST API)
- Tips on error handling, caching, and smooth real-time streaming

`DefaultDatafeed` (exported from `astroneum`) is a Polygon.io REST + WebSocket implementation and requires a Polygon API key.

`createStandardCryptoDatafeed` (exported from `astroneum`) provides a ready-to-use multi-exchange crypto futures feed (Binance, Bitget, OKX) with strict live-only routing and error events via `DATAFEED_ERROR_EVENT`.

---

## Custom Indicator Plugins

```ts
import { registerIndicatorPlugin, type IndicatorPlugin, type CandleData } from 'astroneum'

const spread: IndicatorPlugin<number> = {
  name: 'SPREAD',
  shortName: 'Spread',
  calcParams: [],
  calc(data: CandleData[]) {
    return data.map(c => c.high - c.low)
  }
}

registerIndicatorPlugin(spread)
// then: chartRef.current?.createIndicator('SPREAD')
```

Plugins that define `renderGL` run on a dedicated WebGL2 layer with a per-indicator VBO.  
`render2D` is used as Canvas2D fallback when WebGL2 is unavailable.

### Per-chart plugin mounting

```ts
import { type ChartPlugin } from 'astroneum'

const plugin: ChartPlugin = {
  name: 'my-plugin',
  indicators: [{ name: 'SPREAD', calc(data) { return data.map(c => c.high - c.low) } }],
  onInit({ chart }) {
    chart.createIndicator('SPREAD', true)
    return () => { chart.removeIndicator({ name: 'SPREAD' }) }
  }
}

<AstroneumChart plugins={[plugin]} ... />
```

---

## AstroneumHandle (ref API)

```ts
interface AstroneumHandle {
  setSymbol(symbol: SymbolInfo): void
  setPeriod(period: Period): void
  setTheme(theme: 'dark' | 'light'): void
  setLocale(locale: string): void
  createIndicator(name: string, isStack?: boolean): void
  removeIndicator(filter: { name: string }): void
  getDataListLength(): number
  getLastDataTimestamp(): number | null
  takeScreenshot(): HTMLCanvasElement | null
}
```

---

## Locale Support

19 built-in locales: `en-US`, `zh-CN`, `ja-JP`, `ko-KR`, `de-DE`, `fr-FR`, `es-ES`, `pt-BR`, `ru-RU`, `ar-SA`, `hi-IN`, `tr-TR`, `nl-NL`, `pl-PL`, `it-IT`, `vi-VN`, `th-TH`, `id-ID`.

Override or add locales with `loadLocales(key, dictionary)`.

---

## Main Exports

| Export | Description |
|--------|-------------|
| `AstroneumChart` | Main React chart component |
| `DefaultDatafeed` | Polygon.io REST + WebSocket datafeed |
| `createStandardCryptoDatafeed` | Built-in Binance/Bitget/OKX live crypto datafeed |
| `STANDARD_CRYPTO_SYMBOLS` | Default symbol list for the standard crypto datafeed |
| `DATAFEED_ERROR_EVENT` | Browser event name for datafeed errors (`CustomEvent<DatafeedErrorDetail>`) |
| `MultiChartLayout` | Side-by-side multi-symbol layout |
| `BarReplay` | Bar replay controller |
| `DrawingTemplates` | Save/load drawing templates |
| `AlertManager` | Price alert management |
| `ScriptEngine` | Sandboxed indicator scripting |
| `WatchlistManager` | Symbol watchlist |
| `PortfolioTracker` | Portfolio P&L tracker |
| `PerformanceMode` | Adaptive quality / performance controls |
| `loadLocales` | Register locale dictionaries |
| `registerIndicatorPlugin` | Register custom indicator plugin |
| `registerIndicator` | Register engine-level indicator template |
| `EventBus` | Cross-chart event bus |
| `TickAnimator` | Smooth real-time tick animation helper |
| `RingBuffer` | Circular OHLCV ring buffer |
| `formatPrice`, `formatVolume`, `formatPercent`, … | Formatting utilities |

---

## API Docs

Full API reference: [docs/api.md](docs/api.md)

## License

MIT © kowito


[![npm version](https://img.shields.io/npm/v/astroneum)](https://www.npmjs.com/package/astroneum)
[![bundle size](https://img.shields.io/bundlephobia/minzip/astroneum)](https://bundlephobia.com/package/astroneum)
[![types](https://img.shields.io/npm/types/astroneum)](https://www.npmjs.com/package/astroneum)
[![license: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

## Features

### GPU-Native Rendering Pipeline
- **WebGPU first** — WGSL pipeline with UBO uniforms, render bundles, compute-shader LOD aggregation, and indirect draw. Falls back to WebGL2 → Canvas2D automatically.
- **OffscreenCanvas + Web Worker** candle renderer — `bufferSubData` runs off the main thread; `SharedArrayBuffer` zero-copy VBO eliminates memcpy on every dirty frame.
- **Shared indicator GL canvas** — one `WebGL2RenderingContext` per indicator pane shared by all line and rect renderers; `beginFrame()` clears once per dirty frame.
- **Instanced geometry** — all candles drawn in a single `drawArraysInstanced` call with a 32-byte packed VBO. Pan is O(1) via a pan-offset uniform with no re-upload.
- **VBO overscan** — 64-bar pre-render buffer; small pans skip re-upload entirely.
- **AA line rendering** — GLSL ES 3.0 `fwidth()`-based fragment shader; lines are sub-pixel smooth at any width without Canvas2D fallback.
- **GPU text** — glyph atlas + `TextWebGLRenderer` renders axis labels, price labels, and crosshair glyphs on the GPU. Canvas2D `measureText` is still used for layout; only rasterization moves to GPU.
- **Dirty-flag gate** — `_vboVersion`/`_drawnVersion` pair; unchanged frames skip `clear` + `draw` entirely.

### Indicator & Data Pipeline
- **Indicator Worker pool** — fixed pool of up to 4 dedicated workers; indicator `calc()` runs off the main thread with round-robin dispatch.
- **WASM indicator calculator** — `sma`, `ema`, `rsi`, `bollingerBands` implemented as O(N) pre-allocated WASM routines; `packBars` SIMD-packs OHLCV into a column-store `Float64Array`.
- **`queueMicrotask` debounce** — N burst `appendData()` calls collapse into one indicator-calc round; no redundant recalculations.
- **`requestIdleCallback` deferral** — datasets ≥ 2 000 bars defer indicator calc to idle time; the chart paints its first frame immediately.
- **Incremental tail-update** — live tick triggers O(maxPeriod) partial recalc, not O(N) full pass.
- **SAB ring buffer** — `SharedArrayBuffer`-backed circular buffer with `Atomics` head/tail; `FallbackRingBuffer` for non-isolated contexts.
- **WebTransport datafeed** — HTTP/3 QUIC unordered datagrams for tick data; ordered reliable stream for historical bars; falls back to WebSocket.
- **FlatBuffers binary codec** — `BarsCodec` encodes/decodes bars as a packed binary blob (magic + version + count + N×40-byte records); zero-parse read path.
- **OPFS historical cache** — `Origin Private File System` worker cache; repeat visits skip the network and paint from disk in < 16 ms.
- **Delta tick encoding** — `applyDelta(bar, delta)` patches only changed fields; 5-byte wire packets vs 48-byte full-bar broadcast.

### Scheduling & Platform
- **`scheduler.postTask` priority queue** — tick updates at `user-blocking`; indicator recalcs at `background`; falls back to `queueMicrotask` / `requestIdleCallback`.
- **`IntersectionObserver` render pause** — rAF, VBO uploads, and idle calc are all suppressed when the chart is scrolled off-screen.
- **`PerformanceObserver` adaptive quality** — auto-detects longtasks (> 50 ms); drops to a lower quality tier (disable AA, reduce overscan) on slow devices.
- **`ResizeObserver` debounce** — 150 ms debounce + `devicePixelRatio` change detection collapses display-change bursts into a single GL texture rebuild.
- **`getCoalescedEvents()`** — consumes all intermediate pointer positions per rAF; uses `getPredictedEvents()` for 1-frame speculative crosshair during fast moves.
- **Object pool for `BarRenderData`** — pre-allocated 131 072-slot pool; `pool.reset()` + `pool.alloc()` per frame replaces per-bar heap allocation.
- **CSS `will-change: transform`** — overlay canvas and crosshair pane promoted to compositor layers; crosshair moves compositor-threaded at 120 Hz.

### Benchmarking
- **`PerformanceMark` instrumentation** — `astroneum:frame-start/end`, `astroneum:vbo-upload`, `astroneum:indicator-calc`, `astroneum:draw`; exposed via `Chart.getPerformanceMetrics()`.
- **WebGPU timestamp queries** — `GPUQuerySet` measures true GPU execution time per render pass (not just CPU dispatch time).
- **Perf regression tests** — `src/__tests__/perf/perf-baseline.test.ts` asserts N=50 000 bar timing thresholds for `packBars`, `sma/ema/rsi/bollingerBands`, `BarsCodec`, and `SabRingBuffer`.

### Chart Features
- Candle, bar, area, and line chart types with full WebGL/WebGPU acceleration
- 20+ built-in technical indicators (MA, EMA, BOLL, RSI, MACD, KDJ, and more)
- Custom indicator plugins via `registerIndicatorPlugin` with optional `renderGL` WebGL2 path
- Drawing tools with snap, templates, and undo/redo
- Multi-chart layout, bar replay, alert manager, watchlist, and portfolio tracker
- 19 built-in locales; custom locale dictionary support via `loadLocales`
- Dark / light theme; fully customizable styles

---

## Install

```bash
npm install astroneum
```

For non-Next projects, ensure `react` and `react-dom` are installed in your app.
No additional framework runtime is required.

## Runtime Requirements

- Browser runtime (uses `window`, `document`, `WebSocket`, and `localStorage`)
- React runtime (`react` + `react-dom`, version 18+)
- ESM-compatible bundler/runtime
- Styles imported from `astroneum/style.css`

## Quick Start

```tsx
import { useRef } from 'react'
import { AstroneumChart, type AstroneumHandle, DefaultDatafeed } from 'astroneum'
import 'astroneum/style.css'

const datafeed = new DefaultDatafeed('YOUR_POLYGON_API_KEY')

export default function App() {
	const chartRef = useRef<AstroneumHandle>(null)

	return (
		<AstroneumChart
			ref={chartRef}
			symbol={{ ticker: 'AAPL', shortName: 'AAPL', market: 'stocks' }}
			period={{ multiplier: 1, timespan: 'day', text: '1D' }}
			datafeed={datafeed}
			theme="dark"
			style={{ width: '100%', height: 560 }}
		/>
	)
}
```

`DefaultDatafeed` uses Polygon.io REST + delayed WebSocket endpoints.

## Next.js Usage

See the [Next.js Usage](#nextjs-usage) section at the top for the full setup steps (`transpilePackages`, CSS in layout, import the component).

With a Polygon datafeed:

```tsx
// app/components/Chart.tsx
import { useRef } from 'react'
import { AstroneumChart, type AstroneumHandle, DefaultDatafeed } from 'astroneum'

const datafeed = new DefaultDatafeed(process.env.NEXT_PUBLIC_POLYGON_API_KEY ?? '')

export default function ChartView() {
	const chartRef = useRef<AstroneumHandle>(null)

	return (
		<AstroneumChart
			ref={chartRef}
			symbol={{ ticker: 'AAPL', shortName: 'AAPL', market: 'stocks' }}
			period={{ multiplier: 1, timespan: 'day', text: '1D' }}
			datafeed={datafeed}
			locale="en-US"
			style={{ width: '100%', height: 560 }}
		/>
	)
}
```
```

## Datafeed Interface

If you do not use Polygon, provide your own `Datafeed` implementation:

```ts
import type {
	Datafeed,
	SymbolInfo,
	Period,
	CandleData,
	DatafeedSubscribeCallback
} from 'astroneum'

const myDatafeed: Datafeed = {
	async searchSymbols(search?: string): Promise<SymbolInfo[]> {
		return []
	},
	async getHistoryData(
		symbol: SymbolInfo,
		period: Period,
		from: number,
		to: number
	): Promise<CandleData[]> {
		return []
	},
	subscribe(symbol: SymbolInfo, period: Period, callback: DatafeedSubscribeCallback): void {
		// stream realtime bars/ticks
	},
	unsubscribe(symbol: SymbolInfo, period: Period): void {
		// stop stream
	}
}
```

## Custom Indicator Plugins

Register custom indicators through the public plugin adapter:

```ts
import {
	registerIndicatorPlugin,
	type CandleData,
	type IndicatorPlugin
} from 'astroneum'

const spreadPlugin: IndicatorPlugin<number> = {
	name: 'SPREAD',
	shortName: 'Spread',
	calcParams: [1],
	calc(data: CandleData[]) {
		return data.map(candle => candle.high - candle.low)
	}
}

registerIndicatorPlugin(spreadPlugin)
```

Then create it in any chart instance with `chart.createIndicator('SPREAD')`.

If a plugin defines `renderGL`, Astroneum runs it on a dedicated WebGL2 layer with a reusable per-indicator `vbo`.
If WebGL2 is unavailable, `render2D` is used as the fallback when provided.

If you prefer engine-level templates directly, `registerIndicator` is also exported.

You can also mount plugins per chart instance through `AstroneumOptions.plugins`:

```ts
import {
	type ChartPlugin
} from 'astroneum'

const spreadPlugin: ChartPlugin = {
	name: 'spread-plugin',
	indicators: [
		{
			name: 'SPREAD',
			calc(data) {
				return data.map(candle => candle.high - candle.low)
			}
		}
	],
	onInit({ chart }) {
		chart.createIndicator('SPREAD', true)
		return () => {
			chart.removeIndicator({ name: 'SPREAD' })
		}
	}
}

// Pass plugins as a prop to the component
<AstroneumChart
	symbol={{ ticker: 'AAPL', shortName: 'AAPL', market: 'stocks' }}
	period={{ multiplier: 1, timespan: 'day', text: '1D' }}
	plugins={[spreadPlugin]}
	datafeed={myDatafeed}
	style={{ width: '100%', height: 560 }}
/>
```

## ScriptEngine Notes

`ScriptEngine.compile()` now registers the compiled indicator automatically.
After a successful compile, you can immediately call `chart.createIndicator(compiledName)`.

## Main Exports

- Core: `AstroneumChart`, `DefaultDatafeed`
- Layout and replay: `MultiChartLayout`, `BarReplay`
- Templates and tools: `DrawingTemplates`, `AlertManager`, `ScriptEngine`
- Portfolio and watchlist: `WatchlistManager`, `PortfolioTracker`, `PerformanceMode`
- Formatting and locale: `loadLocales`, `formatPrice`, `formatVolume`, `formatPercent`, `formatDate`, `formatTime`, `formatDateTime`, `formatDuration`, `formatPeriod`, `detectPricePrecision`
- Utilities: `EventBus`, `TickAnimator`, `RingBuffer`, `rafCoalesce`, `rafMergeTick`, `asPrice`, `asVolume`, `asTimestamp`
- Types: `AstroneumOptions`, `AstroneumHandle`, `Datafeed`, `SymbolInfo`, `Period`, `CandleData`, and related helper types

## Locale Support

Built-in locale keys:

- `en-US`
- `zh-CN`
- `ja-JP`
- `ko-KR`
- `de-DE`
- `fr-FR`
- `es-ES`
- `pt-BR`
- `ru-RU`
- `ar-SA`
- `hi-IN`
- `tr-TR`
- `nl-NL`
- `pl-PL`
- `it-IT`
- `vi-VN`
- `th-TH`
- `id-ID`

You can register/override locale dictionaries with `loadLocales(localeKey, dictionary)`.

## API Docs

- Full API reference: [docs/api.md](docs/api.md)

## License

Astroneum is available under MIT.
