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
