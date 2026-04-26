# Astroneum — Next.js Demo

A Next.js 15 + React 19 demo for the [astroneum](https://github.com/kowito/astroneum) charting library.

## Getting started

```bash
# 1. Build the library first (from the repo root)
cd ..
pnpm install
pnpm build

# 2. Install demo deps
cd demo-next
pnpm install

# 3. Start the dev server
pnpm dev        # http://localhost:5556
```

## Features

- Symbol selector (BTCUSDT, ETHUSDT, SOLUSDT, AAPL, TSLA, NVDA)
- Period buttons: 1m / 5m / 15m / 1H / 4H / D / W
- Sub-indicator toggles: VOL, MACD, RSI, KDJ, BOLL
- Dark / Light theme toggle
- Simulated live ticks (no API key required)

## Next.js notes

- `AstroneumChart` uses canvas + React hooks → rendered inside a `'use client'` component (`ChartDemo.tsx`)
- `astroneum/style.css` is imported inside the client component
- `transpilePackages: ['astroneum']` in `next.config.ts` ensures the ESM-only library is bundled correctly by Next.js
