# Building a Datafeed

A **Datafeed** is a simple interface that lets Astroneum fetch historical data and subscribe to real-time ticks from any source. This guide shows 3 patterns: minimal mock, REST API, and real-time stream.

---

## The Datafeed Interface

```ts
interface Datafeed {
  searchSymbols(search?: string): Promise<SymbolInfo[]>
  getHistoryData(
    symbol: SymbolInfo,
    period: Period,
    from: number,
    to: number
  ): Promise<CandleData[]>
  subscribe(
    symbol: SymbolInfo,
    period: Period,
    callback: DatafeedSubscribeCallback
  ): void
  unsubscribe(symbol: SymbolInfo, period: Period): void
}
```

**Key methods:**
- `searchSymbols(search)` — Return matching symbols (used in symbol search bar).
- `getHistoryData(symbol, period, from, to)` — Fetch bars between timestamps (Unix ms).
- `subscribe(symbol, period, callback)` — Stream real-time ticks; call `callback(tick)` on each update.
- `unsubscribe(symbol, period)` — Stop streaming for this symbol/period pair.

---

## Pattern 1: Minimal Mock (for demos)

The simplest datafeed just generates fake data locally:

```ts
import type {
  Datafeed,
  SymbolInfo,
  Period,
  CandleData,
  DatafeedSubscribeCallback
} from 'astroneum'

const SYMBOLS: SymbolInfo[] = [
  {
    ticker: 'BTC',
    shortName: 'BTC',
    name: 'Bitcoin',
    exchange: 'DEMO',
    market: 'crypto'
  }
]

const myDatafeed: Datafeed = {
  searchSymbols(search) {
    const q = search?.toLowerCase() ?? ''
    return Promise.resolve(
      SYMBOLS.filter(s => s.ticker.toLowerCase().includes(q))
    )
  },

  getHistoryData(symbol, period, from, to) {
    // Generate synthetic bars between `from` and `to` timestamps
    const step = period.multiplier * 60_000 // assume period is in minutes for demo
    const bars: CandleData[] = []
    let price = 50000

    for (let ts = from; ts <= to; ts += step) {
      const change = (Math.random() - 0.5) * 1000
      bars.push({
        timestamp: ts,
        open: price,
        high: price + Math.abs(change),
        low: price - Math.abs(change),
        close: price + change,
        volume: Math.random() * 10000,
        turnover: Math.random() * 100000,
      })
      price += change
    }
    return Promise.resolve(bars)
  },

  subscribe(symbol, period, callback) {
    // Emit a tick every 100ms
    let price = 50000
    const interval = setInterval(() => {
      price += (Math.random() - 0.5) * 100
      callback({
        timestamp: Date.now(),
        open: price,
        high: price + 50,
        low: price - 50,
        close: price,
        volume: Math.random() * 100,
        turnover: Math.random() * 1000,
      })
    }, 100)

    // Cleanup when unsubscribed
    const originalUnsubscribe = myDatafeed.unsubscribe
    myDatafeed.unsubscribe = (s, p) => {
      if (s.ticker === symbol.ticker && p.text === period.text) {
        clearInterval(interval)
      }
      originalUnsubscribe(s, p)
    }
  },

  unsubscribe() {
    // Cleanup happens in subscribe() above
  }
}
```

---

## Pattern 2: REST API (static bars only)

Fetch bars from an HTTP API (e.g., `GET /api/bars?symbol=BTC&from=123&to=456`):

```ts
const myDatafeed: Datafeed = {
  async searchSymbols(search) {
    const res = await fetch(`/api/symbols?q=${search}`)
    return res.json()
  },

  async getHistoryData(symbol, period, from, to) {
    const res = await fetch('/api/bars', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticker: symbol.ticker,
        timeframe: period.text,
        from,
        to
      })
    })
    const bars = await res.json() as CandleData[]
    return bars
  },

  subscribe(symbol, period, callback) {
    // Poll for new bars every 5 seconds
    const interval = setInterval(async () => {
      const now = Date.now()
      const res = await fetch('/api/bars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: symbol.ticker,
          timeframe: period.text,
          from: now - 60_000,
          to: now
        })
      })
      const bars = await res.json() as CandleData[]
      if (bars.length > 0) {
        callback(bars[bars.length - 1])
      }
    }, 5000)

    // Store interval ID so unsubscribe can clear it
    const unsubKey = `${symbol.ticker}::${period.text}`
    const intervals = (myDatafeed as any)._intervals ??= new Map()
    intervals.set(unsubKey, interval)
  },

  unsubscribe(symbol, period) {
    const unsubKey = `${symbol.ticker}::${period.text}`
    const intervals = (myDatafeed as any)._intervals
    if (intervals?.has(unsubKey)) {
      clearInterval(intervals.get(unsubKey))
      intervals.delete(unsubKey)
    }
  }
}
```

---

## Pattern 3: WebSocket Streaming (real-time)

Connect to a live market data stream (e.g., Binance WebSocket):

```ts
const myDatafeed: Datafeed = {
  searchSymbols(search) {
    return Promise.resolve([
      {
        ticker: 'BTCUSDT',
        shortName: 'BTC',
        name: 'Bitcoin USDT',
        exchange: 'BINANCE',
        market: 'crypto'
      }
    ])
  },

  async getHistoryData(symbol, period, from, to) {
    // Fetch from REST: GET https://api.binance.com/api/v3/klines
    const interval = '1m' // or '5m', '1h', etc.
    const res = await fetch(
      `https://api.binance.com/api/v3/klines?` +
      `symbol=${symbol.ticker}&interval=${interval}&startTime=${from}&endTime=${to}`
    )
    const rows = await res.json() as any[][]
    return rows.map(row => ({
      timestamp: row[0] as number,
      open: parseFloat(row[1]),
      high: parseFloat(row[2]),
      low: parseFloat(row[3]),
      close: parseFloat(row[4]),
      volume: parseFloat(row[7]),
      turnover: parseFloat(row[7]) // or custom calculation
    }))
  },

  subscribe(symbol, period, callback) {
    const interval = '1m' // map period to interval
    const stream = `${symbol.ticker.toLowerCase()}@kline_${interval}`
    const ws = new WebSocket(`wss://stream.binance.com/ws/${stream}`)

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.e === 'kline') {
          callback({
            timestamp: data.k.t,
            open: parseFloat(data.k.o),
            high: parseFloat(data.k.h),
            low: parseFloat(data.k.l),
            close: parseFloat(data.k.c),
            volume: parseFloat(data.k.v),
            turnover: parseFloat(data.k.q)
          })
        }
      } catch (e) {
        console.error('Parse error:', e)
      }
    }

    ws.onerror = () => ws.close()
    ws.onclose = () => {
      // Implement reconnect logic if needed
    }

    // Store socket so unsubscribe can close it
    const key = `${symbol.ticker}::${period.text}`
    const sockets = (myDatafeed as any)._sockets ??= new Map()
    sockets.set(key, ws)
  },

  unsubscribe(symbol, period) {
    const key = `${symbol.ticker}::${period.text}`
    const sockets = (myDatafeed as any)._sockets
    if (sockets?.has(key)) {
      sockets.get(key).close()
      sockets.delete(key)
    }
  }
}
```

---

## Using a Datafeed in AstroneumChart

```tsx
import { AstroneumChart } from 'astroneum'
import { myDatafeed } from './datafeed'

export function Chart() {
  return (
    <AstroneumChart
      symbol={{ ticker: 'BTC', shortName: 'BTC', name: 'Bitcoin', market: 'crypto' }}
      period={{ multiplier: 1, timespan: 'minute', text: '1m' }}
      datafeed={myDatafeed}
      locale="en-US"
      style={{ width: '100%', height: 600 }}
    />
  )
}
```

---

## Tips

1. **Start simple** — Begin with a REST API; add WebSocket if you need real-time.
2. **Handle errors gracefully** — Return empty arrays if data fetches fail; reconnect on socket close.
3. **Cache symbols** — Don't re-fetch the symbol list on every search.
4. **Timestamp precision** — Use milliseconds (Unix ms) throughout; ensure `from` and `to` are in ms.
5. **Smooth real-time** — Emit ticks smoothly at ~100–200 ms intervals instead of burst updates.
6. **Use TickAnimator** — The library exports `TickAnimator` to interpolate ticks smoothly across frames (see `../src/engine/common/TickAnimator.ts`).

---

## Advanced: Mock with Smooth Animation

For testing, the demo `mockDatafeed.ts` uses:
- **Seeded random generation** — Reproducible fake data across reloads
- **TickAnimator** — Smooth frame-based interpolation of real-time ticks
- **Fallback simulation** — Local bar generation if Binance fails

See `demo/src/mockDatafeed.ts` for the full implementation.
