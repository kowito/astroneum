import type { Metadata } from 'next'
import Link from 'next/link'

import Callout from '../_components/Callout'
import CodeBlock from '../_components/CodeBlock'
import DatafeedInspector from '../_components/DatafeedInspector'
import Diagram from '../_components/Diagram'
import PageNav from '../_components/PageNav'

export const metadata: Metadata = {
  title: 'Datafeeds',
  description: 'A datafeed is four functions. See exactly when the chart calls them, with a live call log.',
}

const REST_FEED = `import type { Datafeed } from 'astroneum'

let socket: WebSocket | undefined

const datafeed: Datafeed = {
  searchSymbols: async (query = '') => {
    const res = await fetch(\`/api/symbols?q=\${encodeURIComponent(query)}\`)
    return res.json()
  },

  getHistoryData: async (symbol, period, from, to) => {
    const res = await fetch(\`/api/bars?symbol=\${symbol.ticker}&tf=\${period.text}&from=\${from}&to=\${to}\`)
    const rows: Array<{ t: number, o: number, h: number, l: number, c: number, v: number }> = await res.json()
    return rows.map(r => ({ timestamp: r.t, open: r.o, high: r.h, low: r.l, close: r.c, volume: r.v }))
  },

  subscribe: (symbol, period, callback) => {
    socket = new WebSocket(\`wss://example.com/stream?symbol=\${symbol.ticker}&tf=\${period.text}\`)
    socket.onmessage = (event) => {
      const r = JSON.parse(event.data)
      callback({ timestamp: r.t, open: r.o, high: r.h, low: r.l, close: r.c, volume: r.v })
    }
  },

  unsubscribe: () => socket?.close(),
}`

export default function DatafeedsPage() {
  return (
    <>
      <h1>Datafeeds</h1>
      <p className="dc-lead">
        A datafeed is how bars reach the chart. It is an object with four functions, and the chart decides when to call
        them. Once you know the rhythm, connecting any data source is straightforward.
      </p>

      <h2 id="the-contract">The contract</h2>
      <Diagram
        doc="getting-started.md"
        id="datafeed-calls"
        label="A sequence: the app renders the chart; the chart asks the datafeed for history and draws it; it subscribes, then the datafeed sends the latest bar repeatedly; when you scroll back the chart asks for older bars; when the symbol or period changes it unsubscribes."
      />
      <table>
        <thead><tr><th>Function</th><th>Called when</th><th>You return</th></tr></thead>
        <tbody>
          <tr><td><code>searchSymbols(search?)</code></td><td>you type in the symbol box</td><td><code>Promise&lt;SymbolInfo[]&gt;</code></td></tr>
          <tr><td><code>getHistoryData(symbol, period, from, to)</code></td><td>the chart loads, and when you scroll back</td><td><code>Promise&lt;CandleData[]&gt;</code>, oldest first</td></tr>
          <tr><td><code>subscribe(symbol, period, callback)</code></td><td>history has loaded</td><td>nothing; call <code>callback(bar)</code> as prices change</td></tr>
          <tr><td><code>unsubscribe(symbol, period)</code></td><td>the symbol or period changes</td><td>nothing; stop sending</td></tr>
        </tbody>
      </table>

      <h2 id="watch-it-happen">Watch it happen</h2>
      <p>
        This chart runs on a datafeed that reports every call it receives. Use the buttons, or drag the chart to the right to
        scroll back in time, and watch the log. You will see <code>getHistoryData</code> asked for an earlier range, and each live
        update arrive as a <code>callback</code>.
      </p>
      <DatafeedInspector />
      <Callout kind="tip">
        <p>
          Notice what happens when you switch symbol: the chart calls <code>unsubscribe</code> for the old one, then{' '}
          <code>getHistoryData</code> and <code>subscribe</code> for the new one. Your datafeed never has to track which symbol is on screen.
        </p>
      </Callout>

      <h2 id="the-rules">Rules to remember</h2>
      <ul>
        <li>Timestamps are in <strong>milliseconds</strong>, not seconds.</li>
        <li><code>getHistoryData</code> returns bars <strong>oldest first</strong>, inside the range it was asked for.</li>
        <li>For live updates, the same timestamp as the last bar <em>replaces</em> it; a newer one <em>adds</em> a bar; an older one is ignored. See the simulator in <Link href="/docs/getting-started/#step-4">Getting started, step 4</Link>.</li>
        <li>If history fails, return an empty array or throw: the chart shows nothing (or the saved bars, if the <Link href="/docs/performance/">history cache</Link> is on).</li>
      </ul>

      <h2 id="write-your-own">Write your own</h2>
      <p>This is the shape of a feed backed by a REST API and a WebSocket. The addresses are placeholders.</p>
      <CodeBlock code={REST_FEED} title="datafeed.ts" />
      <p>
        The full <a href="https://github.com/kowito/astroneum/blob/main/docs/datafeed-guide.md" target="_blank" rel="noreferrer">datafeed guide</a> on
        GitHub covers a REST feed, a WebSocket feed, error handling and smooth animation of ticks.
      </p>

      <h2 id="which-datafeed">Which datafeed should I use?</h2>
      <Diagram
        doc="getting-started.md"
        id="which-datafeed"
        label="A decision. Crypto and a quick start: createStandardCryptoDatafeed. US stocks via Polygon.io: DefaultDatafeed. Your own API or database: write the four methods. The same data as Renko or Heikin-Ashi: wrap it with createTransformedDatafeed."
      />
      <table>
        <thead><tr><th>Datafeed</th><th>What it is</th></tr></thead>
        <tbody>
          <tr><td><code>createStandardCryptoDatafeed()</code></td><td>Binance, Bitget and OKX futures, 100+ symbols, real-time WebSocket. Needs no key.</td></tr>
          <tr><td><code>DefaultDatafeed</code>, <code>WebSocketDatafeed</code></td><td>Polygon.io REST and WebSocket (<code>astroneum/datafeeds/polygon</code>).</td></tr>
          <tr><td><code>WebTransportDatafeed</code></td><td>Experimental. A documented protocol over HTTP/3 (<code>astroneum/datafeeds/webtransport</code>).</td></tr>
          <tr><td><code>createTransformedDatafeed(feed, ...)</code></td><td>Wraps any datafeed to serve Heikin-Ashi, Renko or range bars.</td></tr>
        </tbody>
      </table>
      <PageNav slug="datafeeds" />
    </>
  )
}
