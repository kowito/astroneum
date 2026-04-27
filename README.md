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

## How To Use

1. Install `astroneum` and ensure your app already provides `react` and `react-dom`.
2. Create one datafeed instance for the chart lifetime. For live crypto futures, use `createStandardCryptoDatafeed(...)`.
3. Render `AstroneumChart` with a `symbol`, `period`, and `datafeed`.
4. Keep symbol and period in your own React state, then update the chart through the ref with `setSymbol(...)` and `setPeriod(...)` when the user changes them.
5. If you use the built-in crypto feed, listen for `DATAFEED_ERROR_EVENT` so unsupported symbols or feed failures show a real error instead of fake fallback data.

## Release Automation

This repository includes automated version bumping through GitHub Actions.

- Workflow: `.github/workflows/auto-version-bump.yml`
- Auto trigger: every push to `main`
- Manual trigger: Actions tab → Auto Version Bump → Run workflow

Default behavior on push:

- Runs `npm version prerelease --preid beta --no-git-tag-version`
- Commits updated version files with a skip-ci commit message
- Creates and pushes a matching git tag (`v<version>`)

Manual run supports these bump types:

- prerelease
- patch
- minor
- major

---

## Quick Start

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import {
	AstroneumChart,
  DATAFEED_ERROR_EVENT,
	createStandardCryptoDatafeed,
	STANDARD_CRYPTO_SYMBOLS,
	type AstroneumHandle,
  type DatafeedErrorDetail,
  type Period,
  type SymbolInfo,
} from 'astroneum'
import 'astroneum/style.css'

const PERIODS: Period[] = [
  { multiplier: 1, timespan: 'minute', text: '1m' },
  { multiplier: 5, timespan: 'minute', text: '5m' },
  { multiplier: 1, timespan: 'hour', text: '1H' },
] 

export default function App() {
  const chartRef = useRef<AstroneumHandle>(null)
  const datafeed = useMemo(() => createStandardCryptoDatafeed({ smoothingDuration: 320 }), [])
  const [symbol, setSymbol] = useState<SymbolInfo>(STANDARD_CRYPTO_SYMBOLS[0])
  const [period, setPeriod] = useState<Period>(PERIODS[0])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onDatafeedError = (event: Event): void => {
      const detail = (event as CustomEvent<DatafeedErrorDetail>).detail
      if (!detail || detail.ticker !== symbol.ticker) return
      setError(detail.message)
    }

    window.addEventListener(DATAFEED_ERROR_EVENT, onDatafeedError)
    return () => window.removeEventListener(DATAFEED_ERROR_EVENT, onDatafeedError)
  }, [symbol.ticker])

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <select
          value={symbol.ticker}
          onChange={event => {
            const next = STANDARD_CRYPTO_SYMBOLS.find(item => item.ticker === event.target.value)
            if (!next) return
            setSymbol(next)
            setError(null)
            chartRef.current?.setSymbol(next)
          }}
        >
          {STANDARD_CRYPTO_SYMBOLS.map(item => (
            <option key={item.ticker} value={item.ticker}>{item.ticker}</option>
          ))}
        </select>

        {PERIODS.map(item => (
          <button
            key={item.text}
            onClick={() => {
              setPeriod(item)
              setError(null)
              chartRef.current?.setPeriod(item)
            }}
          >
            {item.text}
          </button>
        ))}
      </div>

      {error && <div style={{ marginBottom: 12, color: '#c62828' }}>{error}</div>}

      <AstroneumChart
        ref={chartRef}
        symbol={symbol}
        period={period}
        datafeed={datafeed}
        theme="dark"
        subIndicators={['VOL']}
        style={{ width: '100%', height: 560 }}
      />
    </div>
  )
}
```

The important part is to create the datafeed once with `useMemo`, keep `symbol` and `period` in React state, and only use the ref for imperative updates when the user changes them.

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
import { useMemo, useRef } from 'react'
import {
	AstroneumChart,
	createStandardCryptoDatafeed,
	STANDARD_CRYPTO_SYMBOLS,
	type AstroneumHandle,
} from 'astroneum'

export default function Chart() {
  const chartRef = useRef<AstroneumHandle>(null)
  const datafeed = useMemo(() => createStandardCryptoDatafeed({ smoothingDuration: 320 }), [])

  return (
    <AstroneumChart
      ref={chartRef}
      symbol={STANDARD_CRYPTO_SYMBOLS[0]}
      period={{ multiplier: 1, timespan: 'minute', text: '1m' }}
			datafeed={datafeed}
      locale="en-US"
      subIndicators={['VOL']}
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

For a ready-to-use live feed, use Astroneum's built-in standard crypto implementation:

```ts
import {
	DATAFEED_ERROR_EVENT,
	STANDARD_CRYPTO_SYMBOLS,
	createStandardCryptoDatafeed,
	type DatafeedErrorDetail,
} from 'astroneum'

const datafeed = createStandardCryptoDatafeed({ smoothingDuration: 320 })

window.addEventListener(DATAFEED_ERROR_EVENT, event => {
	const detail = (event as CustomEvent<DatafeedErrorDetail>).detail
	console.error(detail.message)
})

const symbol = STANDARD_CRYPTO_SYMBOLS[0]
```

This built-in feed ships with live Binance USD-M, Bitget USDT futures, and OKX swap routing. If a symbol or period is unsupported, it emits `DATAFEED_ERROR_EVENT` and returns no mock fallback data.

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
// then mount it through a ChartPlugin or another chart lifecycle hook
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
  getDataListLength(): number
  getLastDataTimestamp(): number | null
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
