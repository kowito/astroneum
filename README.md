# Astroneum

Financial charting toolkit for browser applications.

[![npm version](https://img.shields.io/npm/v/astroneum)](https://www.npmjs.com/package/astroneum)
[![bundle size](https://img.shields.io/bundlephobia/minzip/astroneum)](https://bundlephobia.com/package/astroneum)
[![types](https://img.shields.io/npm/types/astroneum)](https://www.npmjs.com/package/astroneum)
[![license: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

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

## Quick Start (ESM)

```ts
import { Astroneum, DefaultDatafeed } from 'astroneum'
import 'astroneum/style.css'

const chart = new Astroneum({
	container: 'chart',
	symbol: {
		ticker: 'AAPL',
		shortName: 'AAPL',
		market: 'stocks'
	},
	period: { multiplier: 1, timespan: 'day', text: '1D' },
	datafeed: new DefaultDatafeed('YOUR_POLYGON_API_KEY')
})

chart.setTheme('dark')
```

`DefaultDatafeed` uses Polygon.io REST + delayed WebSocket endpoints.

## React / Next.js Usage

Astroneum itself is not a React component. Create it inside a client-only effect.

```tsx
'use client'

import { useEffect, useRef } from 'react'
import { Astroneum, DefaultDatafeed } from 'astroneum'
import 'astroneum/style.css'

export default function ChartView() {
	const containerRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!containerRef.current) return

		const chart = new Astroneum({
			container: containerRef.current,
			symbol: { ticker: 'AAPL', shortName: 'AAPL', market: 'stocks' },
			period: { multiplier: 1, timespan: 'day', text: '1D' },
			datafeed: new DefaultDatafeed(process.env.NEXT_PUBLIC_POLYGON_API_KEY ?? '')
		})

		chart.setLocale('en-US')
	}, [])

	return <div id="chart" ref={containerRef} style={{ width: '100%', height: 560 }} />
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

You can also mount plugins per chart instance through `ChartProOptions.plugins`:

```ts
import {
	Astroneum,
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

new Astroneum({
	container: 'chart',
	symbol: { ticker: 'AAPL', shortName: 'AAPL', market: 'stocks' },
	period: { multiplier: 1, timespan: 'day', text: '1D' },
	plugins: [spreadPlugin],
	datafeed: myDatafeed
})
```

## ScriptEngine Notes

`ScriptEngine.compile()` now registers the compiled indicator automatically.
After a successful compile, you can immediately call `chart.createIndicator(compiledName)`.

## Main Exports

- Core: `Astroneum`, `DefaultDatafeed`
- Layout and replay: `MultiChartLayout`, `BarReplay`
- Templates and tools: `DrawingTemplates`, `AlertManager`, `ScriptEngine`
- Portfolio and watchlist: `WatchlistManager`, `PortfolioTracker`, `PerformanceMode`
- Formatting and locale: `loadLocales`, `formatPrice`, `formatVolume`, `formatPercent`, `formatDate`, `formatTime`, `formatDateTime`, `formatDuration`, `formatPeriod`, `detectPricePrecision`
- Utilities: `EventBus`, `TickAnimator`, `RingBuffer`, `rafCoalesce`, `rafMergeTick`, `asPrice`, `asVolume`, `asTimestamp`
- Types: `ChartProOptions`, `ChartPro`, `Datafeed`, `SymbolInfo`, `Period`, `CandleData`, and related helper types

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
