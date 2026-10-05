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

Links published before the demo moved (`/?type=line`) redirect to `/demo/?type=line`.

Chart type descriptions live in `src/chartTypeInfo.ts` and are shared by the demo picker and the
home page gallery. The gallery thumbnails and the share image (`public/og.png`) are snapshots; to
refresh them, capture each `/demo/?type=…` page and crop to the price pane.

## Render benchmark

`/bench/` mounts a chart on synthetic data and times every `requestAnimationFrame`
callback, so a scenario reports how much main-thread time the chart spends drawing
while the input runs. `scripts/render-bench.mjs` (repo root) drives it in headless
Chrome and prints a table:

```bash
pnpm dev                                   # in demo/, or any server that serves /bench/
node scripts/render-bench.mjs --url http://localhost:3000/bench/ --bars 20000 --path webgl
node scripts/render-bench.mjs --zoomout 40 --profile tick --tree   # dense view, with a CPU profile
```

| Option | Meaning |
|---|---|
| `--path auto\|webgl\|worker\|canvas2d` | which candle renderer the chart may use (`auto` is what a browser picks) |
| `--ind default\|none` | EMA + BOLL on the candles and VOL, MACD, RSI panes, or candles only |
| `--zoomout N` | zoom out N wheel notches first, so many more bars are visible |
| `--scenarios …` | any of `idle,hover,pan,wheelpan,zoom,tick,newbar` |
| `--trace [scenario]` | list the `requestAnimationFrame` callbacks that run |
| `--profile <scenario>\|all`, `--tree` | sample the CPU and print the hottest functions, or a call tree |
| `--json file` | also save the results |

Build the library with `ASTRONEUM_MINIFY=0 pnpm build` first when profiling, so
function names survive. Do not pass `--disable-gpu` to Chrome: without a GPU, headless
Chrome has no WebGL2 at all and every path silently becomes Canvas2D.

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
