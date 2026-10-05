'use client'

import { AstroneumChart } from 'astroneum'
import type { CandleData, Datafeed, Period, SymbolInfo } from 'astroneum'
import 'astroneum/style.css'

const MINUTE = 60_000
const symbol: SymbolInfo = { ticker: 'DEMO', name: 'Demo market', pricePrecision: 2 }
const period: Period = { multiplier: 1, timespan: 'minute', text: '1m' }

let price = 100
function nextBar(timestamp: number): CandleData {
  const open = price
  price = Math.max(1, price + (Math.random() - 0.5) * 2)
  return {
    timestamp,
    open,
    high: Math.max(open, price) + Math.random() * 0.4,
    low: Math.min(open, price) - Math.random() * 0.4,
    close: price,
    volume: Math.round(Math.random() * 1000),
  }
}

let timer: ReturnType<typeof setInterval> | undefined

const datafeed: Datafeed = {
  // The symbol search box. One symbol is enough for this demo.
  searchSymbols: async () => [symbol],

  // Called with a time range. Return bars inside it, oldest first.
  getHistoryData: async (_symbol, _period, from, to) => {
    const bars: CandleData[] = []
    for (let t = Math.ceil(from / MINUTE) * MINUTE; t <= to; t += MINUTE) bars.push(nextBar(t))
    return bars
  },

  // Send a bar every second. Same minute = update it; new minute = new bar.
  subscribe: (_symbol, _period, callback) => {
    let last = nextBar(Math.floor(Date.now() / MINUTE) * MINUTE)
    timer = setInterval(() => {
      const minute = Math.floor(Date.now() / MINUTE) * MINUTE
      if (minute > last.timestamp) {
        last = nextBar(minute)
      } else {
        price = Math.max(1, price + (Math.random() - 0.5))
        last = { ...last, close: price, high: Math.max(last.high, price), low: Math.min(last.low, price) }
      }
      callback(last)
    }, 1000)
  },

  unsubscribe: () => clearInterval(timer),
}

export default function App() {
  return (
    <AstroneumChart
      symbol={symbol}
      period={period}
      datafeed={datafeed}
      theme="dark"
      style={{ width: '100%', height: 360 }}
    />
  )
}
