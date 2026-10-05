# Astroneum — Next.js Demo

A Next.js 15 + React 19 demo for the [astroneum](https://github.com/kowito/astroneum) charting library.

## Getting started

```bash
# From the repo root
pnpm install
pnpm dev        # http://localhost:3000
```

`pnpm dev` (root) builds the library on first run, rebuilds it as you edit
`src/`, and starts this demo's Next.js dev server. To run only the Next.js
server against an already-built `dist/`, use `pnpm --filter astroneum-demo-next dev`.

## Data Source

The demo uses astroneum's built-in standard crypto datafeed (`createStandardCryptoDatafeed`).

- Binance USD-M futures
- Bitget USDT futures
- OKX USDT swap

## Features

- Data source badge: live exchange route per symbol
- Symbol selector (multi-exchange crypto)
- Period buttons: 1m / 5m / 15m / 1H / 4H / D / W
- Sub-indicator toggles: VOL, MACD, RSI, KDJ, BOLL
- Dark / Light theme toggle
- Strict live-only behavior with explicit feed errors

## Next.js notes

- `AstroneumChart` uses canvas + React hooks → rendered inside a `'use client'` component (`ChartDemo.tsx`)
- `astroneum/style.css` is imported inside the client component
- `transpilePackages: ['astroneum']` in `next.config.ts` ensures the ESM-only library is bundled correctly by Next.js

## The site

`pnpm dev` serves the whole site (<http://localhost:3000>):

| Route | What it is | Source |
|---|---|---|
| `/` | Home page: hero with a live chart, features, chart-type gallery, quick start, links | `src/app/page.tsx`, `src/app/landing.css` |
| `/demo/` | The full chart demo. `?type=line`, `area`, `ohlc`, `hollow`, `candles`, `heikin-ashi`, `renko` and `range` open a chart type | `src/app/demo/page.tsx`, `src/app/components/ChartDemo.tsx` |
| `/docs/…` | The documentation site: eight pages with live charts, interactive widgets and diagrams | `src/app/docs/` |

Links published before the demo moved (`/?type=line`) redirect to `/demo/?type=line`.

Chart type descriptions live in `src/chartTypeInfo.ts` and are shared by the demo picker and the
home page gallery. The gallery thumbnails and the share image (`public/og.png`) are snapshots; to
refresh them, capture each `/demo/?type=…` page and crop to the price pane.

### The docs pages

Each page is a server component in `src/app/docs/<slug>/page.tsx`; the sidebar and the previous/next links come from
one list in `src/docs/nav.ts`, so add a page there and it appears everywhere.

- **Diagrams are shared with the Markdown docs.** A diagram in `docs/*.md` starts with a `%% diagram: <id>` line.
  `<Diagram doc="architecture.md" id="first-load" label="…" />` reads that block at build time and draws it in the
  browser with Mermaid, so the GitHub page and the website never drift apart. A missing id fails the build.
- **Examples are real files.** `src/docs/examples/*.tsx` are the programs shown on the Getting started page.
  `<SourceCode>` prints the file's own source and `<Example>` runs it, so the code on screen is the code that runs.
- **Charts mount when scrolled into view** (`LazyMount`), so a long page starts one chart at a time.
- **The market data is simulated** (`src/docs/mockMarket.ts`, deterministic) wherever a page needs a feed that works
  offline and can report every call, such as the datafeed inspector.

## Deploying (GitHub Pages)

The demo is exported as static files and published by
[`.github/workflows/demo-pages.yml`](../.github/workflows/demo-pages.yml) on every
push to `main` that touches the library or the site:
**https://kowito.github.io/astroneum/**

To build the same output locally:

```bash
pnpm build                                              # the demo imports the built library
PAGES_BASE_PATH=/astroneum pnpm --filter astroneum-demo-next build   # → demo/out
```

`PAGES_BASE_PATH` must match the repository name (a project page is served from
`/<repo>/`); leave it unset for a user/organisation site or a custom domain.
Pages must be enabled once under Settings → Pages → Source: **GitHub Actions**.
