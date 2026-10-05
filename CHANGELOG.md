# Changelog

All notable changes to **astroneum** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
once it reaches v1.0. Until then, minor releases may include breaking changes
— always check this file before upgrading.

## [Unreleased]

### Changed — Website

- https://kowito.github.io/astroneum/ is now a home page (hero with a live chart,
  features, a gallery of every chart type, quick start, links to npm, GitHub and
  the docs) instead of the bare demo. The demo moved to `/demo/`; old
  `/?type=…` links redirect there. Pages have titles, descriptions and share
  preview tags.

### Added — Chart type demos

- The demo has a **chart type picker**, each type on its own link
  (`?type=line`, `area`, `ohlc`, `hollow`, `candles`, `heikin-ashi`, `renko`,
  `range`). The earlier "Candles / Candles + Line" toggle is replaced; the live
  close-price line pane is now a separate "+ Line pane" button.
- **`createTransformedDatafeed(datafeed, factory)`** — serves a derived series
  (Heikin-Ashi, Renko, Range bars, or your own transform) from any time-based
  datafeed, for history and live ticks. Previously those generators only worked
  on a static array.

### Changed — Smaller npm package

- `docs/` and `CHANGELOG.md` are no longer published to npm (they stay in the
  repository; the README links to them on GitHub).
- `astroneum.css` ships the icon font as WOFF only. The embedded-OpenType,
  TrueType and SVG copies were base64-inlined too and only served browsers
  that are not supported.
- Icon and toolbar SVG paths are rounded to two decimals (they carried up to
  17 digits). Rendering is visually identical.

### Added — Performance modules

These modules were written in April but never connected to the chart, so
they never shipped in the npm package even though the README listed them.

- **History cache** — `historyCache` prop on `AstroneumChart` (off by
  default) keeps loaded history per symbol and period in the Origin Private
  File System. A reload fetches only from the newest cached bars; a closed bar
  that changed upstream drops the series; when the datafeed fails or answers
  empty, the cached bars are shown. Older history is served from the cache
  when available. `clearHistoryCache(namespace?)` deletes it.
- **Indicator acceleration** — `configureIndicatorWorkers({ enabled: true })`
  (off by default). For series of at least `minBars` (20 000) bars, MA, EMA,
  RSI and BOLL step only the changed bars on each tick (~0.1 ms instead of a
  full recompute) and run full recomputes in Web Workers. Results are
  bit-identical to the main-thread templates. Workers that can't start (e.g.
  CSP) or fail fall back to the main thread.
- **`astroneum/datafeeds/webtransport`** (experimental) —
  `WebTransportDatafeed` over a documented protocol: one bidirectional stream
  per request, an ordered stream per live subscription, several
  subscriptions per connection, reconnect with re-subscribe. Also exports
  `BarsCodec`.

### Changed

- `BarsCodec` frames are version 2: 56 bytes per bar with volume, turnover
  and a float64 timestamp (pre-1970 dates work). Version 1 is gone; nothing
  ever shipped it.
- The perf baseline measures the shipped indicator kernels and codec.

### Removed

- `SabRingBuffer`, `OPFSCache` and the `WasmIndicators` alias — never
  exported. `HistoryCache` replaces `OPFSCache`, whose exact-range keys could
  never hit.

### Fixed — Data loading

- Scrolling back never loaded older history: right after the first load the
  chart asked for newer bars, the request was never answered, and the engine
  stayed in its loading state.
- A slow history response for the previous symbol or period could replace the
  new one's bars; it is now dropped.

### Changed — Node.js 22

- The project now targets **Node.js 22**. `engines.node` is `>=22` (was
  `>=18`; Node 18 and 20 are end-of-life), `.nvmrc` pins 22 for local
  development, and all CI workflows read their Node version from it.

### Added — Real-time line chart

- **`line` candle type** — `styles={{ candle: { type: 'line' } }}` draws the
  close series as a plain stroke (no area fill). It follows the live datafeed:
  each tick moves the last point, a new bar extends the line, and the pulsing
  last-price marker tracks the latest value. Styling reuses `candle.area`
  (`lineColor`, `lineSize`, `smooth`, `value`, `point`). Also available in the
  Settings modal (translated in all 18 locales). The Y-axis fits the plotted
  values just like `area`.
- `isCandleLineType()` / `CandleLineType` helpers in the engine styles module.
- **`LINE` indicator** — a live close-price line chart in its own pane under
  the candlesticks (`subIndicators={['VOL', 'LINE']}`). It shares the time
  axis, zoom and crosshair with the main chart, uses the symbol's price
  precision, and updates on every tick. Also listed in the indicator modal.

### Fixed — Indicator props and removal

- `mainIndicators` and `subIndicators` are now applied when they change after
  mount. Previously they were read only once, so toggling indicators through
  props (as the demo's indicator chips do) had no effect on the chart. Only
  names that entered or left the props are touched, so indicators added
  through the indicator modal are kept.
- Removing a sub-indicator from the indicator modal now works: the chart
  passed the indicator id where a pane id was expected, so the removal
  matched nothing.

### Added — Full Indicator Parity (50 total, +23 new)

Astroneum now ships **50 technical indicators** — up from 27 — achieving full
parity with the comparison table against TradingView Pro. Every indicator in the
original roadmap (Phases 1–4) is implemented.

**Phase 1 — Critical (MVP)**
- **ATR** (Average True Range) — `averageTrueRange.ts` — market volatility
  measure used for position sizing and stop-loss placement.
- **ADX** (Average Directional Index) — `averageDirectionalIndex.ts` —
  standalone trend-strength indicator (0–25 weak, 25–50 strong, 50+ very
  strong).
- **A/D** (Accumulation/Distribution) — `accumulationDistribution.ts` —
  cumulative volume + CLV money flow, divergence signals for reversals.

**Phase 2 — Important (Competitive Feature)**
- **CMF** (Chaikin Money Flow) — `chaikinMoneyFlow.ts` — money flow over N
  periods using close-location-within-range (default 20).
- **MFI** (Money Flow Index) — `moneyFlowIndex.ts` — volume-weighted RSI
  using typical price, overbought >80 / oversold <20.
- **VWAP** (Volume Weighted Average Price) — `volumeWeightedAveragePrice.ts`
  — cumulative volume-weighted typical price overlay.
- **Ichimoku Cloud** — `ichimokuCloud.ts` — 5-line comprehensive trend
  system (Tenkan/Kijun/Senkou A/B/Chikou), default periods 9/26/52.

**Phase 3 — Polish (Market Completeness)**
- **DEMA / TEMA / WMA / VWMA** — double/triple/weighted/volume-weighted
  moving averages (`doubleExponentialMovingAverage.ts`,
  `tripleExponentialMovingAverage.ts`, `weightedMovingAverage.ts`,
  `volumeWeightedMovingAverage.ts`).
- **HV** (Historical Volatility) — `historicalVolatility.ts` — annualized
  volatility from log returns × √252.
- **DC** (Donchian Channels) — `donchianChannels.ts` — highest-high /
  lowest-low channels with midline.
- **KC** (Keltner Channels) — `keltnerChannels.ts` — EMA middle line with
  ATR-based upper/lower bands.
- **SuperTrend** — `superTrend.ts` — trend-following volatility stop with
  direction tracking.

**Phase 4 — Advanced (Niche Features)**
- **STDDEV** (Standard Deviation) — `standardDeviation.ts` — population
  standard deviation of close over N periods.
- **VROC** (Volume Rate of Change) — `volumeRateOfChange.ts` — percentage
  change in volume over N periods.
- **PP** (Pivot Points) — `pivotPoints.ts` — classic pivot points with
  R1–R3 resistance and S1–S3 support levels.
- **CORR** (Correlation Coefficient) — `correlationCoefficient.ts` —
  Pearson's R between close and linear sequence 1..N.
- **LinReg** (Linear Regression) — `linearRegression.ts` — least-squares
  regression line on close prices.
- **AMA** (Adaptive Moving Average / KAMA) — `adaptiveMovingAverage.ts` —
  Kaufman's adaptive MA with efficiency-ratio smoothing.
- **HMA** (Hull Moving Average) — `hullMovingAverage.ts` — WMA-based
  lag-reduced moving average.
- **ZZ** (ZigZag) — `zigzag.ts` — pivot-based trend-reversal detection
  with configurable deviation percentage.

### Changed

- **Demo page expanded** — category-organised indicator picker displaying all
  50 indicators with tooltips, overlay vs. sub-pane visual distinction
  (amber/green), and active-indicator status bar with counts.
- **`INDICATOR_COMPARISON.md`** fully rewritten to track all indicators,
  coverage percentages per category, and completed roadmap.

### Fixed

- **SuperTrend state tracking** — replaced fragile float comparison
  `prevSuperTrend === upperBand` with `direction` variable for correct
  trend-state transitions.
- **HMA performance** — reduced from O(n³) to O(n²) by pre-computing
  `2*WMA(n/2) - WMA(n)` values before the final WMA pass.
- **ZigZag pivot detection** — replaced adjacent-bar comparison with
  running extreme tracking to reliably capture peaks/troughs during
  consolidation phases.

---

### Added — TradingView Competitive Parity

- **Heikin-Ashi candle type** — `barStyle="heikin_ashi"` prop. `heikinAshi(data)` exported.
- **Crosshair sync** in `MultiChartLayout` — `onCrosshairMove()` / `setCrosshair()` on handle.
- **Measure tool** — 18th drawing tool in extension. Pixel distance label + risk/reward line.
- **Magnet/Snap helpers** — `snapToOhlc()` and `snapAngle()` in `DrawingSnapper`.
- **Undo/Redo manager** — `UndoManager` class using `serializeState()`/`loadState()`.
- **Extended keyboard shortcuts** — arrow keys pan, Page/Home/End, mouse wheel zoom at cursor.
- **Copy/paste drawings** — Ctrl+C copies overlays as JSON, Ctrl+V pastes.
- **Session Visualizer** — `SessionVisualizer` renders session high/low/open/close lines.
- **Volume Profile** — `volumeProfilePlugin` horizontal histogram with POC + Value Area.
- **Position Visualizer** — `PositionVisualizer` entry/stop/target lines on chart.
- **Compare Overlay** — `createCompareIndicator()` overlays second symbol normalized to %.
- **Lock all drawings** — `lockAllDrawings(locked)` on `AstroneumHandle`.
- **Drawing live preview** — `DrawingTemplates.preview()` + `applyColor()` per-overlay.
- **Price axis scaling** — `priceScale='linear'|'log'|'percent'|'indexed'` prop + `PriceScaleTransform`.
- **Chart templates** — `ChartTemplateManager` singleton saves/loads named configs to localStorage.
- **Multi-timeframe resampling** — `resampleBars()`, `forwardFill()`, `mtfIndicator()`.
- **Non-time-based bars** — `generateRenko()`, `generateKagi()`, `generateTickBars()`, `generateRangeBars()`.
- **Point & Figure** — `generatePointAndFigure()`, `computePFColumns()`, `pfColumnsToBars()`.
- **Multi-period layout** — `MultiPeriodLayout` stacked same-symbol different periods.
- **Auto pattern detection** — `zigzag()`, `detectSupportResistance()`, `zigzagPlugin`.
- **DOM visualization** — `domPlugin` bid/ask volume ladder.

### Fixed — Bug, Perf & Security Hardening

- **Bug: `rafMergeTick` low-merge inverted** — comparison operator fixed (was `<`, now `>`).
- **Bug: `ScriptEngine` figures mutation** — shared `this.figures` now uses `[...result.figures]`.
- **Bug: Plugin `figureKeys` closure leak** — moved to per-instance `extendData`.
- **Bug: `Math.max(...arr)` stack overflow risk** — replaced with iterative loops in `DrawingSnapper`/`GlyphAtlas`.
- **Bug: LTTB decimation NaN** — empty bucket guard added in `PerformanceMode.decimate()`.
- **Bug: `virtualizeWindow` overlap** — startIdx/endIdx clamp added.
- **Bug: `useKeyboardShortcuts` stale ref** — fixed stable wrapper pattern.
- **Perf: Tooltip style objects pre-computed** at module scope (no per-render allocation).
- **Perf: `adjustFromTo()` integer math** for week/month/year (eliminates `new Date()` allocations).
- **Perf: `serializeState()` uses `structuredClone`** instead of recursive `deepClone`.
- **Perf: 6 `useEffect` hooks batched** into one for engine prop sync.
- **Perf: `sortBarsAsc()` O(n) validation** before sort (99% of API responses are pre-sorted).
- **Perf: Shared color helpers** extracted to `candleShaders.ts` (~160 lines duplicated code removed).
- **Perf: `TaskScheduler` priority queue** — data > indicator > overlay priority ordering.
- **Perf: `IndicatorWorkerPool` SAB transfer** when `crossOriginIsolated`.
- **Perf: `packBars()` optional columns** bitmap for skipping unused columns.
- **Perf: `SharedIndicatorGLCanvas` FinalizationRegistry** for auto-cleanup.
- **Perf: aria-live string buffer reuse** instead of template-string allocation per move.
- **Security: ScriptEngine sandbox hardened** — `Object.freeze(Object/Array.prototype)` + `eval` blocked.
- **Security: AlertManager webhook URL validated** — https-only, block private IPs/localhost.
- **Security: localStorage writes debounced** — `AlertManager.check()` saves at most 1/s.
- **Security: localStorage schema validation** on load — corrupted data rejected.
- **Security: WebSocket URL scheme validation** — `wss://`/`ws://` required.
- **Security: Polygon API key** moved from URL query param to `Authorization: Bearer` header.
- **Security: `#apiKey` private class field** — non-enumerable, safe from `JSON.stringify`.
- **Security: Locale strings stripped of HTML tags** — XSS prevention.
- **Security: `BarsCodec.decode()` capped** at 500k bars to prevent OOM.
- **Security: `pnpm audit` in all CI workflows.**
- **Security: TA surface gating + OPFS path safety** documented.

## [0.3.0] — 2026-06-15

### Added — v0.5 Polish (partial)

- **Lazy locale loading** ([src/i18n/index.ts](src/i18n/index.ts)) —
  only `en-US` is bundled eagerly; the other 18 locales are loaded on
  demand via dynamic `import()`. New public exports:
  - `loadLocale(key)` — async loader for built-in locales
  - `BUILTIN_LOCALES` — the canonical list
  - Existing `loadLocales(key, dictionary)` continues to work for custom
    translations.
- **Drawing & layout persistence** — `serializeState()` and `loadState(state)`
  on `AstroneumHandle` capture / restore theme, locale, timezone, symbol,
  period, styles, indicators, and overlays as JSON.
  See [docs/api.md](docs/api.md#serializestate--loadstate).
- **Accessibility pass** — opt-in via the new `accessible` prop on
  `<AstroneumChart>`. When enabled, the chart container gets `tabindex=0`,
  `role="img"`, and an `aria-label`; a visually-hidden `aria-live="polite"`
  region announces OHLCV on crosshair changes (throttled to ~10/s).
- **High-contrast theme** — set `theme="high-contrast"` for a
  WCAG-conscious black/white/yellow palette with strong focus rings.
- **Benchmark CI workflow**
  ([.github/workflows/benchmark.yml](.github/workflows/benchmark.yml)) —
  runs `pnpm size` and the perf tests on every PR and posts the perf
  output as a sticky comment.

### Changed

- `WasmIndicators.ts` renamed to **`TypedArrayIndicators.ts`** to match
  what it actually is (a column-store TS implementation). A back-compat
  shim is kept at the old path with `@deprecated` JSDoc and will be
  removed in v1.0.

### Deferred

Still tracked for v0.6 – v1.0; not in this release:

- WebGPU renderer / real Rust + WASM SIMD indicators
- `OrderManager` + broker package
- Heatmap / footprint / options-chain panes
- Full mobile audit & Storybook site
- React component tests (jsdom + RTL) + Playwright visual regression
- Compare overlay UI

---

## [0.2.0] — 2026-05-30

### Added — v0.3 Hardening

- **Subpath exports** for tree-shakeable, opt-in feature modules
  ([#roadmap-4](README.md#v04--modularization)):
  - `astroneum/replay` — `BarReplay`
  - `astroneum/multichart` — `MultiChartLayout`
  - `astroneum/watchlist` — `WatchlistManager`
  - `astroneum/portfolio` — `PortfolioTracker`
  - `astroneum/alerts` — `AlertManager`
  - `astroneum/script` — `ScriptEngine`
  - `astroneum/datafeeds/polygon` — `DefaultDatafeed` + `WebSocketDatafeed`
  - `astroneum/datafeeds/crypto` — `createStandardCryptoDatafeed` + adapters
- **`size-limit` budget** ([.size-limit.json](.size-limit.json)) with one
  budget per entry. Run `pnpm size` after `pnpm build`.
- **Datafeed contract tests** ([src/__tests__/datafeed-contract.test.ts](src/__tests__/datafeed-contract.test.ts))
  — type-level + behavioural checks for any `Datafeed` implementation.
- **SSR smoke tests** ([src/__tests__/ssr-smoke.test.ts](src/__tests__/ssr-smoke.test.ts))
  — verifies the root entry and all subpath entries import cleanly with no
  DOM globals defined, and that the root entry's public API surface is stable.
- **`CONTRIBUTING.md`**, **`SECURITY.md`**, **`CODE_OF_CONDUCT.md`**,
  and this `CHANGELOG.md`.
- **Browser support matrix** documented in [README](README.md#browser-support).

### Changed

- `pnpm verify` order is now `lint → typecheck → build → test` so SSR and
  bundle tests can assert against fresh `dist/` output.
- `tsup.config.ts` now bundles every subpath entry and injects `'use client'`
  into every emitted JS file (not just `dist/index.js`).
- `package.json#files` widened from `dist/*.{js,css,d.ts}` to
  `dist/**/*.{js,css,d.ts}` so nested subpath artifacts ship.

### Fixed

- `src/index.ts` no longer side-imports the non-existent
  `./styles/index.less` (was a leftover from a SCSS migration and caused the
  build to fail outright on a clean install).

---

## [0.2.0-baseline] — 2026-05-30

Initial public roadmap baseline. See git history for details prior to this
changelog being introduced.
