# Astroneum

Professional financial charting library for React applications — now with
TradingView-class features, zero licensing fees, and MIT license.

[![npm version](https://img.shields.io/npm/v/astroneum?label=npm)](https://www.npmjs.com/package/astroneum)
[![npm downloads](https://img.shields.io/npm/dm/astroneum)](https://www.npmjs.com/package/astroneum)
[![React 18-19](https://img.shields.io/badge/react-18%20%7C%2019-149eca)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/typescript-ready-3178c6)](https://www.typescriptlang.org/)
[![Node >=22](https://img.shields.io/badge/node-%3E%3D22-339933)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

**[Website](https://kowito.github.io/astroneum/) · [Live demo](https://kowito.github.io/astroneum/demo/)**

![Astroneum chart — dark theme with EMA, MACD, RSI and volume indicators](screenshort-1.png)

![Astroneum chart — dark theme with multi-pane indicators](screenshort-2.png)

## Features

### Chart Types
- **Candlestick, OHLC, bar, area, line, Heikin-Ashi** — rendered via Canvas2D / WebGL2 with GPU acceleration
- **Real-time line chart** — `styles={{ candle: { type: 'line' } }}` (or `'area'` for a filled line); the last point follows every datafeed tick
- **Live Heikin-Ashi, Renko and Range bars** — wrap any datafeed with `createTransformedDatafeed(datafeed, …)`: history and live ticks are re-derived and streamed to the chart
- **Non-time-based bars** — Renko, Kagi, Tick, Range, and Point & Figure generators
- **Multi-chart grid** (2/4/8/16 panes) and **multi-period stacked layout** (e.g. 4H + 1H + 15m)

### Indicators & Analysis
- **50 built-in indicators** — SMA, EMA, MACD, RSI, KDJ, Bollinger Bands, Ichimoku, SuperTrend, and more
- **Volume Profile** — horizontal histogram with POC, Value Area, and price-level bucketing
- **ZigZag + auto pattern detection** — swing highs/lows, support/resistance clustering
- **Depth of Market** — bid/ask volume ladder visualization
- **Compare/Overlay** — second symbol normalized to percentage on same pane
- **Multi-timeframe indicators** — resample any TF, forward-fill to lower TF bars
- **Custom indicator plugins** via `registerIndicatorPlugin()` with Canvas2D or WebGL2 render path
- **Script editor** — sandboxed Pine-Script–inspired JS environment for custom indicators

### Drawing Tools
- **18 drawing tools** — trend lines, Fibonacci (circle, spiral, extension, segment, fan), Gann boxes, pitchforks, Elliott waves, harmonic patterns (ABCD, XABCD), and **measure/ruler tool**
- **Magnet/Snap** — snap to bar OHLC within 8px, angle snap to 0°/30°/45°/60°/90°
- **Drawing style presets** (7 built-in + custom) with live preview and per-drawing color
- **Undo/Redo** — `UndoManager` with 50-entry depth via Ctrl+Z / Ctrl+Y
- **Copy/Paste drawings** — Ctrl+C/V across charts via clipboard
- **Lock all drawings** toggle
- **Session visualizer** — auto session high/low/open/close lines

### Navigation & UX
- **Keyboard shortcuts** — arrows pan, Page/Home/End scroll/jump, mouse wheel zoom at cursor
- **Crosshair sync** across multi-chart and multi-period layouts
- **Price axis scaling** — linear, log, percentage, indexed-to-100
- **Chart templates** — save/load named configurations to localStorage
- **Accessibility** — `accessible` prop with aria-live OHLCV announcement
- **State serialization** — full chart state persistence & recovery via `serializeState()`/`loadState()`

### Data & Performance
- **History cache** — opt-in `historyCache` prop keeps loaded history per symbol in the Origin Private File System: reloads fetch only the newest bars, and the chart still opens with cached bars when the datafeed is down. Stored as compact `BarsCodec` frames (56 bytes per bar, volume included)
- **Indicator acceleration** — opt-in `configureIndicatorWorkers({ enabled: true })`: on series of 20 000+ bars, MA/EMA/RSI/BOLL update only the changed bars on each tick and run full recomputes in Web Workers, with results identical to the main-thread calculation
- **TickAnimator** — smooth close/high/low interpolation at 60fps
- **TaskScheduler** with priority queue (data > indicator > overlay)

### Datafeeds
- **StandardCryptoDatafeed** — 100+ symbols, Binance/Bitget/OKX futures, real-time WebSocket
- **DefaultDatafeed & WebSocketDatafeed** — Polygon.io REST + WebSocket
- **WebTransportDatafeed** — experimental, `astroneum/datafeeds/webtransport`: HTTP/3 streams for servers implementing its [documented protocol](https://github.com/kowito/astroneum/blob/main/docs/datafeed-guide.md#pattern-4-webtransport-experimental)
- **BYO datafeed** — 4-method interface (`searchSymbols`, `getHistoryData`, `subscribe`, `unsubscribe`)

### Developer Experience
- **Fully typed TypeScript** — branded financial types (`Price`, `Volume`, `Timestamp`)
- **9 tree-shakeable subpath exports** — import only what you need
- **18 languages** — lazy-loaded on demand, dark/light/high-contrast themes
- **SSR-safe** — `'use client'` on every entry, Next.js App Router compatible
- **MIT license** — no usage limits, no watermark, no "Powered by" branding

---

### Chart type demos

Every type below runs live on its own link:

| Chart type | Live demo |
|---|---|
| Candlestick | [open](https://kowito.github.io/astroneum/demo/?type=candles) |
| Hollow candles | [open](https://kowito.github.io/astroneum/demo/?type=hollow) |
| OHLC bars | [open](https://kowito.github.io/astroneum/demo/?type=ohlc) |
| **Line** | [open](https://kowito.github.io/astroneum/demo/?type=line) |
| Area | [open](https://kowito.github.io/astroneum/demo/?type=area) |
| Heikin-Ashi | [open](https://kowito.github.io/astroneum/demo/?type=heikin-ashi) |
| Renko | [open](https://kowito.github.io/astroneum/demo/?type=renko) |
| Range bars | [open](https://kowito.github.io/astroneum/demo/?type=range) |

## Install

```bash
npm install astroneum
```

`react` and `react-dom` ≥ 18 are peer dependencies.

## Quick Start

```tsx
import { useMemo, useRef, useState } from 'react'
import {
  AstroneumChart,
  createStandardCryptoDatafeed,
  STANDARD_CRYPTO_SYMBOLS,
  type AstroneumHandle,
  type Period,
  type SymbolInfo,
} from 'astroneum'
import 'astroneum/style.css'

export default function App() {
  const chartRef = useRef<AstroneumHandle>(null)
  const datafeed = useMemo(() => createStandardCryptoDatafeed(), [])
  const [symbol] = useState<SymbolInfo>(STANDARD_CRYPTO_SYMBOLS[0])
  const [period] = useState<Period>({ multiplier: 1, timespan: 'hour', text: '1H' })

  return (
    <AstroneumChart
      ref={chartRef}
      symbol={symbol}
      period={period}
      datafeed={datafeed}
      theme="dark"
      subIndicators={['VOL']}
      style={{ width: '100%', height: 560 }}
    />
  )
}
```

## Documentation

| Guide | |
|---|---|
| [Getting started](https://github.com/kowito/astroneum/blob/main/docs/getting-started.md) | Ten small steps from an empty folder to a live chart, with diagrams |
| [How it works](https://github.com/kowito/astroneum/blob/main/docs/architecture.md) | The parts of the chart and how data moves through them |
| [Datafeed guide](https://github.com/kowito/astroneum/blob/main/docs/datafeed-guide.md) | Connect a REST API or WebSocket |
| [API reference](https://github.com/kowito/astroneum/blob/main/docs/api.md) | Every prop, method and export |
| [Plugin guide](https://github.com/kowito/astroneum/blob/main/docs/plugin-development.md) | Write your own indicator |

## Key Props

| Prop | Type | Description |
|------|------|-------------|
| `symbol` | `SymbolInfo` | Symbol to display |
| `period` | `Period` | Timeframe (1m, 5m, 1H, 4H, D, etc.) |
| `datafeed` | `Datafeed` | Data source (crypto, Polygon, or custom) |
| `theme` | `string` | `'dark'`, `'light'`, or `'high-contrast'` |
| `barStyle` | `'candle' \| 'heikin_ashi'` | Candle rendering style |
| `priceScale` | `'linear' \| 'log' \| 'percent' \| 'indexed'` | Price axis scale |
| `locale` | `string` | BCP-47 locale (e.g. `'ja-JP'`) |
| `drawingBarVisible` | `boolean` | Show drawing toolbar |
| `mainIndicators` | `IndicatorDef[]` | Main pane indicators |
| `subIndicators` | `string[]` | Sub-pane indicators (`['VOL', 'MACD', 'RSI']`); add `'LINE'` for a live close-price line chart pane under the candles |
| `plugins` | `ChartPlugin[]` | Custom plugins with lifecycle hooks |
| `historyCache` | `boolean \| { namespace?, maxBars? }` | Cache loaded history in the browser (OPFS); off by default |
| `accessible` | `boolean` | Screen-reader support |
| `style` / `className` | | Container styling |

## Subpath Exports

```tsx
// Main entry
import { AstroneumChart, DefaultDatafeed } from 'astroneum'

// Tree-shakeable subpaths
import { BarReplay }            from 'astroneum/replay'
import { MultiChartLayout }     from 'astroneum/multichart'
import { MultiPeriodLayout }    from 'astroneum'              // same symbol, stacked periods
import { WatchlistManager }     from 'astroneum/watchlist'
import { PortfolioTracker }     from 'astroneum/portfolio'
import { AlertManager }         from 'astroneum/alerts'
import { ScriptEngine }         from 'astroneum/script'
import { UndoManager }          from 'astroneum'
import { ChartTemplateManager } from 'astroneum'
import { SessionVisualizer }    from 'astroneum'

// Datafeeds
import { createStandardCryptoDatafeed, STANDARD_CRYPTO_SYMBOLS } from 'astroneum/datafeeds/crypto'
import { DefaultDatafeed, WebSocketDatafeed }                     from 'astroneum/datafeeds/polygon'
import { WebTransportDatafeed, BarsCodec }                        from 'astroneum/datafeeds/webtransport' // experimental

// Utilities
import { heikinAshi }                     from 'astroneum'  // OHLC → Heikin-Ashi transform
import { zigzag, detectSupportResistance } from 'astroneum' // pattern detection
import { resampleBars, forwardFill }      from 'astroneum'  // multi-TF resampling
import { generateRenko, generateKagi,
         generateTickBars, generateRangeBars,
         generatePointAndFigure }         from 'astroneum'  // non-time-based bars
import { transformCandles, untransformPrice } from 'astroneum' // price scale transforms

// Plugins
import { volumeProfilePlugin, domPlugin, zigzagPlugin,
         pointAndFigurePlugin }           from 'astroneum'  // registerIndicatorPlugin(...)
import { createCompareIndicator }         from 'astroneum'  // compare symbols overlay
```

## Browser Support

| Browser | Minimum | Notes |
|---------|---------|-------|
| Chrome / Edge | 110+ | Full WebGL2, history cache, WebTransport |
| Firefox | 115+ | Full WebGL2, history cache, WebTransport |
| Safari | 16.4+ | Full WebGL2; history cache on 26+ |
| iOS Safari | 16.4+ | Touch + pinch |

Graceful fallback: no WebGL2 → Canvas2D; no writable OPFS (older Safari, private browsing) → history loads from the datafeed as usual; no Web Workers → indicators stay on the main thread; no OffscreenCanvas → main-thread rendering.

## Next.js Usage

```ts
// next.config.ts
const nextConfig = { transpilePackages: ['astroneum'] }
```

```tsx
// app/layout.tsx
import 'astroneum/style.css'
```

The library ships with `'use client'` built in — no extra directive needed.

## License

MIT — use it anywhere, no fees, no limits, no branding requirement.
