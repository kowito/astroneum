# How it works

A picture of the parts of Astroneum and how data moves through them. Read this when
you want to know *why* the chart behaves the way it does, or before changing the code.
To just use the chart, start with [Getting started](./getting-started.md).

**Contents:**
[The big picture](#the-big-picture) ·
[What is on screen](#what-is-on-screen) ·
[The life of data](#the-life-of-data) ·
[Chart types](#chart-types) ·
[Indicators](#indicators) ·
[The history cache](#the-history-cache) ·
[Where the code lives](#where-the-code-lives) ·
[Releases and deploys](#releases-and-deploys) ·
[Words used in these docs](#words-used-in-these-docs)

---

## The big picture

Astroneum is a React component on top of a drawing engine. Your app gives it a
**datafeed** (where the bars come from) and settings; the engine turns bars into pixels.

```mermaid
flowchart TB
    subgraph App["Your app"]
        P["Props: symbol, period,<br/>indicators, styles"]
        F["Your datafeed"]
    end
    subgraph React["React layer: src/chart, src/widget"]
        C["AstroneumChart"]
        U["Toolbars and dialogs<br/>period bar, drawing bar,<br/>indicator and settings dialogs"]
    end
    subgraph Engine["Engine: src/engine (no React)"]
        S["Store<br/>the bars, indicators,<br/>drawings, scroll and zoom"]
        L["Chart<br/>panes and layout"]
        V["Views<br/>candles, lines, axes,<br/>crosshair, drawings"]
    end
    CV[("Canvas<br/>2D, plus WebGL<br/>for fast candles")]

    P --> C
    F -->|"bars"| C
    C --> S
    U --> C
    S --> L --> V --> CV
```

Why it is split this way:

- **The engine knows nothing about React.** It takes a container element and draws into it.
  That keeps the drawing code fast and testable, and leaves the door open for other frameworks.
- **The React layer is glue.** It creates the engine, passes props in, and renders the
  dialogs and toolbars around the canvas.
- **The datafeed is the only thing you must provide.** Everything else has a default.

## What is on screen

```text
┌──────────────────────────────────────────────────────────────────────┐
│  PERIOD BAR   BTC   1m 5m 15m 1H 4H D    Indicator  Settings  ...    │
├────┬─────────────────────────────────────────────────────┬───────────┤
│ D  │                                                     │  price    │
│ R  │              MAIN PANE  (candle_pane)               │  axis     │
│ A  │      candles or line + overlay indicators           │           │
│ W  │      + the drawings you add                         │ 86,400    │
│ I  │                                                     │ 86,200    │
│ N  ├─────────────────────────────────────────────────────┤           │
│ G  │  SUB-PANE: VOL                                      │           │
│    ├─────────────────────────────────────────────────────┤           │
│ B  │  SUB-PANE: RSI          (drag a divider to resize)  │           │
│ A  ├─────────────────────────────────────────────────────┴───────────┤
│ R  │                       TIME AXIS                                  │
└────┴──────────────────────────────────────────────────────────────────┘
```

| Part | What it is | Where |
|---|---|---|
| Period bar | timeframe buttons, indicator and settings buttons | `src/widget/period-bar` |
| Drawing bar | the tools on the left: lines, Fibonacci, Gann, measure... | `src/widget/drawing-bar` |
| Main pane | the price chart; overlay indicators (EMA, BOLL) draw here | `src/engine/pane/CandlePane.ts` |
| Sub-panes | one per sub-indicator; each has its own price axis | `src/engine/pane/IndicatorPane.ts` |
| Time axis | shared by every pane, so scrolling moves them together | `src/engine/pane/XAxisPane.ts` |

Every pane stacks a **main canvas** for the data (bars, lines, indicator values) and an
**overlay canvas** on top for things that change constantly (the crosshair, the drawing
you are making). The overlay repaints without redrawing all the bars.

## The life of data

### First load

```mermaid
sequenceDiagram
    participant App as Your app
    participant React as AstroneumChart
    participant Store as Engine store
    participant Feed as Datafeed

    App->>React: mount with symbol, period, datafeed
    React->>Store: set symbol and period, ask for data
    Store->>React: getBars (type init)
    React->>Feed: getHistoryData(symbol, period, from, to)
    Note over React,Feed: from..to covers about 500 bars
    Feed-->>React: bars, oldest first
    React-->>Store: callback(bars)
    Store->>Store: replace the data, calculate indicators, draw
    Store->>Feed: subscribe(symbol, period, onBar)
```

### Live updates

Once subscribed, the datafeed calls the chart's callback with the newest bar. The chart
compares timestamps with the last bar it has:

```mermaid
flowchart TD
    A["Datafeed calls callback(bar)"] --> B{"bar.timestamp compared<br/>with the last bar"}
    B -->|"greater"| C["Add a new bar<br/>(the old one is final)"]
    B -->|"equal"| D["Overwrite the last bar<br/>in place (price moved)"]
    B -->|"smaller"| E["Ignore"]
    C --> F["Recalculate indicators<br/>(batched, so many ticks<br/>cost one calculation)"]
    D --> F
    F --> G["Fit the vertical scale<br/>to what is visible"]
    G --> H["Redraw"]
```

Two details worth knowing:

- Recalculation is **batched**. If ten ticks arrive in the same instant, indicators are
  calculated once with the latest data, not ten times.
- A tick that only changes the last bar takes a lighter layout path than a new bar, because
  the axis width cannot have changed.

### Scrolling back in time

When you pan until the first loaded bar is on screen, the chart asks for older data:

```mermaid
sequenceDiagram
    participant User
    participant Store as Engine store
    participant React as AstroneumChart
    participant Feed as Datafeed

    User->>Store: drag the chart right
    Note over Store: the oldest loaded bar is now visible
    Store->>React: getBars (type forward, from the oldest timestamp)
    React->>Feed: getHistoryData(an earlier range)
    Feed-->>React: older bars
    React-->>Store: callback(bars, more = bars.length > 0)
    Store->>Store: put them in front of the existing bars
    Note over Store: the view is measured from the newest bar,<br/>so it does not jump
    Note over Store: an empty answer means "no more"<br/>and stops further requests
```

The engine also has a "backward" request, for bars *newer* than the last one. Newer bars
arrive through `subscribe`, so the chart answers it with an empty result immediately.

## Chart types

There are two families, and the family decides how you set it up.

```mermaid
flowchart LR
    subgraph Styles["Drawn from the same bars (a style)"]
        S1["Candlestick"]
        S2["Hollow candles"]
        S3["OHLC bars"]
        S4["Line"]
        S5["Area"]
    end
    subgraph Derived["Built from the bars (a transformed datafeed)"]
        D1["Heikin-Ashi"]
        D2["Renko"]
        D3["Range bars"]
    end
    Styles --> X["styles.candle.type"]
    Derived --> Y["createTransformedDatafeed"]
```

### How a derived chart stays live

`createTransformedDatafeed` sits between the chart and your datafeed. It keeps the raw
bars, re-derives the series on every tick, and passes the chart only what *changed*.

```mermaid
sequenceDiagram
    participant Chart
    participant Wrap as createTransformedDatafeed
    participant Feed as Your datafeed

    Chart->>Wrap: getHistoryData(...)
    Wrap->>Feed: getHistoryData(...)
    Feed-->>Wrap: raw bars
    Note over Wrap: the factory runs once here<br/>and picks fixed settings<br/>(for example the Renko brick size)
    Wrap-->>Chart: derived bars
    Chart->>Wrap: subscribe(...)
    Wrap->>Feed: subscribe(...)
    loop every raw tick
        Feed-->>Wrap: raw bar
        Note over Wrap: update raw bars, re-derive, compare with last output
        alt a new brick formed, or the last bar changed
            Wrap-->>Chart: only the new or changed bars
        else nothing visible changed
            Note over Wrap: send nothing
        end
    end
```

The chart can only replace its newest bar or add new ones. It cannot rewrite older bars,
which is why derived series only change at their end. It is also why they cannot scroll
back past the window they were built from.

## Indicators

An indicator is a function from bars to numbers, plus a description of how to draw them.

```mermaid
flowchart LR
    A["New bars<br/>(load, tick, scroll)"] --> B["Mark indicators<br/>as stale"]
    B --> C["Wait one moment<br/>(microtask) to batch"]
    C --> D["Queue the work<br/>at background priority"]
    D --> E{"calc() returns"}
    E -->|"values"| F["Store results"]
    E -->|"a promise"| G["Wait, then store"]
    F --> H["Redraw the panes"]
    G --> H
```

- Each of the ~50 built-in indicators lives in `src/engine/extension/indicator/`.
- `calc` may return a promise. That is how the optional worker mode plugs in without
  changing anything else.
- Your own indicators follow the same shape: see the [plugin guide](./plugin-development.md).

### Optional: workers for very long histories

Off by default. Turn it on with `configureIndicatorWorkers({ enabled: true })`.

```mermaid
flowchart TD
    A["calc() called for<br/>MA, EMA, RSI or BOLL"] --> B{"Enabled, 20,000+ bars,<br/>and plain-number settings?"}
    B -->|"No"| M["Normal calculation<br/>on the main thread"]
    B -->|"Yes"| C{"Same data as last time,<br/>only the last bar changed<br/>or bars were added?"}
    C -->|"Yes"| T["Step only the new bars<br/>from saved state<br/>about 0.1 ms"]
    C -->|"No: new data"| W["Clear old values,<br/>compute in a Web Worker"]
    W -->|"worker fails or times out"| M
```

The results are identical either way. A test compares the worker maths to the normal
indicators bar for bar, so turning it on never changes what you see.

## The history cache

Off by default. Turn it on with the `historyCache` prop.

```mermaid
flowchart TD
    L["Initial load"] --> R["Read saved bars<br/>for this symbol and period"]
    R --> E{"Anything saved<br/>that reaches the window?"}
    E -->|"No"| FULL["Fetch the full window<br/>then save it"]
    E -->|"Yes"| TAIL["Fetch only from 2 bars<br/>before the newest saved bar"]
    TAIL --> OK{"Result"}
    OK -->|"empty or failed"| OFF["Show the saved bars<br/>(works offline)"]
    OK -->|"a closed bar differs<br/>from the saved copy"| FULL
    OK -->|"consistent"| MERGE["Merge, save, show"]
```

Why each rule exists:

| Rule | Reason |
|---|---|
| Re-fetch 2 bars back | the newest saved bar may have been unfinished; some feeds treat `from` as exclusive |
| A changed closed bar drops the cache | prices were adjusted (a split, a correction), so the saved copy is wrong |
| Never save an empty answer | feeds sometimes return nothing on error; that must not erase good data |
| Saved in the browser's private file store (OPFS) | works offline, needs no server |

## Where the code lives

```mermaid
flowchart LR
    subgraph src
        chart["chart/<br/>AstroneumChart and features"]
        widget["widget/<br/>toolbars, dialogs"]
        engine["engine/<br/>store, panes, views,<br/>indicators, workers"]
        datafeed["datafeed/<br/>crypto, Polygon,<br/>WebTransport, cache"]
        extension["extension/<br/>drawing tools"]
        entries["entries/<br/>the subpath imports"]
        i18n["i18n/<br/>18 languages"]
        scripting["scripting/<br/>script editor engine"]
    end
    chart --> engine
    widget --> chart
    datafeed --> chart
    extension --> engine
    entries --> chart
    entries --> datafeed
```

| Folder | Purpose |
|---|---|
| `src/chart` | `AstroneumChart` and chart-level features (replay, multi-chart, alerts, templates, transformed datafeeds) |
| `src/engine` | the drawing engine: store, panes, views, ~50 indicators, optional workers |
| `src/widget` | the UI around the canvas: period bar, drawing bar, dialogs |
| `src/datafeed` | the built-in datafeeds, the binary codec, the history cache |
| `src/extension` | the drawing tools (Fibonacci, Gann, pitchforks, and more) |
| `src/entries` | one tiny file per subpath import such as `astroneum/replay` |
| `src/__tests__` | tests; run them with `pnpm test` |
| `demo/` | the website and the live demo (a Next.js app) |

[CONTRIBUTING.md](../CONTRIBUTING.md) covers setup, the checks to run, and how to add a subpath.

## Releases and deploys

Merging to `main` does the work; nobody runs a release by hand for a beta.

```mermaid
flowchart TD
    A["Open a pull request"] --> B{"Touches src, package.json<br/>or the lockfile?"}
    B -->|"Yes"| C["Benchmark check runs<br/>install, build, size, speed tests"]
    B -->|"No"| D
    C --> D["Merge to main"]
    D --> E["Auto Version Bump"]
    D --> F{"demo/ or src/ changed?"}
    E --> E1["lint, typecheck, build, test"]
    E1 --> E2["next beta number"]
    E2 --> E3["publish to npm<br/>(tag: beta)"]
    E3 --> E4["commit the new version<br/>and tag it"]
    F -->|"Yes"| G["Deploy demo to GitHub Pages"]
    G --> G1["build library, build site,<br/>publish it"]
```

### Cutting a stable release

Betas happen on every merge. A stable version is a deliberate click:

1. Make sure everything you want is merged and the changelog describes it.
2. On GitHub: **Actions → Auto Version Bump → Run workflow**, and pick the bump type.
3. The workflow runs the full checks, publishes with the `latest` tag, commits the
   version, and tags it.

| Bump type | Example: from `0.4.1-beta.7` you get | Use it for |
|---|---|---|
| `prerelease` | `0.4.1-beta.8` | another beta (this is what a merge does) |
| `patch` | `0.4.1` | bug fixes only |
| `minor` | `0.5.0` | new features |
| `major` | `1.0.0` | breaking changes, after 1.0 |

A published npm version can never be reused, so a bump to a number that already exists
fails. Check `npm view astroneum versions` first if unsure.

## Words used in these docs

| Word | Meaning |
|---|---|
| **Bar** or **candle** | one period of trading: open, high, low, close (and volume) |
| **Period** | the length of one bar: 1 minute, 1 hour, 1 day |
| **Tick** | a live price update for the current bar |
| **Datafeed** | the object that supplies bars; four methods |
| **Pane** | one horizontal panel: the main chart or an indicator |
| **Overlay indicator** | an indicator drawn on the price chart (moving averages) |
| **Sub-indicator** | an indicator in its own pane (RSI, MACD, volume) |
| **Drawing** or **overlay** | a shape you draw on the chart (the engine calls these overlays) |
| **Derived series** | bars computed from your bars (Heikin-Ashi, Renko, range bars) |
