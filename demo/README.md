# Astroneum — Next.js Demo

A Next.js 15 + React 19 demo for the [astroneum](https://github.com/kowito/astroneum) charting library.

## Getting started

```bash
# 1. Build the library first (from the repo root)
cd ..
pnpm install
pnpm build

# 2. Install demo deps
cd demo
pnpm install

# 3. Start the dev server
pnpm dev        # http://localhost:5556
```

## Online Data Mode (Polygon)

The demo now supports two data sources:

- `Online` (Polygon delayed market data)
- `Local Generated` (deterministic mock candles, no network needed)

To enable `Online`, create `demo/.env.local` with:

```bash
NEXT_PUBLIC_POLYGON_API_KEY=your_polygon_api_key
```

If no key is set, `Online` is disabled and the demo uses `Local Generated`.

## Features

- Data source selector: Online / Local Generated
- Symbol selector (crypto + stocks)
- Period buttons: 1m / 5m / 15m / 1H / 4H / D / W
- Sub-indicator toggles: VOL, MACD, RSI, KDJ, BOLL
- Dark / Light theme toggle
- Simulated live ticks in local mode (no API key required)

## Next.js notes

- `AstroneumChart` uses canvas + React hooks → rendered inside a `'use client'` component (`ChartDemo.tsx`)
- `astroneum/style.css` is imported inside the client component
- `transpilePackages: ['astroneum']` in `next.config.ts` ensures the ESM-only library is bundled correctly by Next.js
