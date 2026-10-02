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

## Deploying (GitHub Pages)

The demo is exported as static files and published by
[`.github/workflows/demo-pages.yml`](../.github/workflows/demo-pages.yml) on every
push to `main` that touches the library or the demo:
**https://kowito.github.io/astroneum/**

To build the same output locally:

```bash
pnpm build                                              # the demo imports the built library
PAGES_BASE_PATH=/astroneum pnpm --filter astroneum-demo-next build   # → demo/out
```

`PAGES_BASE_PATH` must match the repository name (a project page is served from
`/<repo>/`); leave it unset for a user/organisation site or a custom domain.
Pages must be enabled once under Settings → Pages → Source: **GitHub Actions**.
