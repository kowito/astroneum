# Astroneum

Financial charting toolkit for browser applications.

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

```tsx
'use client'

import { useRef } from 'react'
import { AstroneumChart, type AstroneumHandle, DefaultDatafeed } from 'astroneum'
import 'astroneum/style.css'

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
