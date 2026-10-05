import type { Metadata } from 'next'

import Callout from '../_components/Callout'
import CacheInspector from '../_components/CacheInspector'
import CodeBlock from '../_components/CodeBlock'
import Diagram from '../_components/Diagram'
import PageNav from '../_components/PageNav'

export const metadata: Metadata = {
  title: 'Speed and offline',
  description: 'The history cache and indicator workers: what they do, when to turn them on, and a live look at what is saved.',
}

export default function PerformancePage() {
  return (
    <>
      <h1>Speed and offline</h1>
      <p className="dc-lead">
        Two optional features, both off by default. The history cache makes reloads fetch less and keeps a chart usable offline.
        Indicator workers keep a chart with a very long history smooth.
      </p>

      <h2 id="history-cache">History cache</h2>
      <p>
        Turn it on with one prop. The chart then remembers the bars it loaded, in the browser, for each symbol and timeframe.
      </p>
      <CodeBlock code={`<AstroneumChart historyCache /* or historyCache={{ namespace: 'my-feed', maxBars: 20000 }} */ />`} />
      <h3 id="see-it-work">See it work</h3>
      <p>
        This chart has the cache on. The panel shows how many bars each load asked the datafeed for, and what is saved. Reload the
        page and compare: the second load fetches a handful of bars instead of the whole window.
      </p>
      <CacheInspector />

      <h3 id="how-it-decides">How it decides what to fetch</h3>
      <Diagram
        doc="architecture.md"
        id="cache-decision"
        label="On load, read the saved bars. If nothing reaches the window, fetch the full window and save it. Otherwise fetch only from two bars before the newest saved bar. If that comes back empty or fails, show the saved bars (offline). If a closed bar differs from the saved copy, refetch the whole window. Otherwise merge, save and show."
      />
      <table>
        <thead><tr><th>Rule</th><th>Reason</th></tr></thead>
        <tbody>
          <tr><td>Re-fetch two bars back</td><td>The newest saved bar may have been unfinished, and some feeds treat <code>from</code> as exclusive.</td></tr>
          <tr><td>A changed closed bar drops the cache</td><td>Prices were adjusted (a split, a correction), so the saved copy is wrong.</td></tr>
          <tr><td>Never save an empty answer</td><td>Feeds sometimes return nothing on error. That must not erase good data.</td></tr>
          <tr><td>Saved in the browser&apos;s private file store</td><td>It works offline and needs no server. Browsers that cannot write there simply skip the cache.</td></tr>
        </tbody>
      </table>
      <Callout kind="note" title="Use a namespace">
        <p>
          If two datafeeds can return the same ticker, give each a <code>namespace</code> so their saved bars never mix. To delete
          saved bars from code, call <code>clearHistoryCache(namespace?)</code>.
        </p>
      </Callout>

      <h2 id="indicator-workers">Indicator workers</h2>
      <p>
        With tens of thousands of bars, recalculating an indicator takes long enough to make scrolling stutter. For the six
        built-in indicators with step kernels (MA, EMA, RSI, BOLL, VOL, MACD) a live tick always takes a shortcut that only
        recomputes the newest bar; workers move the remaining heavy part, the full recompute on a first load or a new symbol, off
        the page&apos;s main thread.
      </p>
      <CodeBlock code={`import { configureIndicatorWorkers } from 'astroneum'\n\n// Applies to every chart on the page. MA, EMA, RSI, BOLL, VOL and MACD, on 20,000+ bars.\nconfigureIndicatorWorkers({ enabled: true })`} />
      <Diagram
        doc="architecture.md"
        id="worker-decision"
        label="When MA, EMA, RSI, BOLL, VOL or MACD is calculated: if only the last bar changed or bars were added, step just the new bars from saved state. If it is new data and workers are on with 20,000 or more bars, clear the old values and compute in a Web Worker, falling back to the main thread if the worker fails; otherwise compute on the main thread."
      />
      <h3 id="what-it-buys">What it buys</h3>
      <p>
        Measured in Chrome on a laptop with 200,000 one-minute bars. Your numbers will differ, but the shape holds.
      </p>
      <table>
        <thead><tr><th>Case</th><th>Without</th><th>With workers</th></tr></thead>
        <tbody>
          <tr><td>A live tick (only the last bar changed)</td><td>about 0.1 ms</td><td>about 0.1 ms</td></tr>
          <tr><td>Longest page freeze, full recompute: Bollinger Bands</td><td>29 ms</td><td>9 ms</td></tr>
          <tr><td>Longest page freeze, full recompute: RSI</td><td>21 ms</td><td>14 ms</td></tr>
          <tr><td>Longest page freeze, full recompute: moving average</td><td>19 ms</td><td>15 ms</td></tr>
          <tr><td>Longest page freeze, full recompute: EMA</td><td>11 ms</td><td>11 ms</td></tr>
        </tbody>
      </table>
      <p>
        Full recomputes gain less than you might expect because turning the numbers into chart rows still happens on the page;
        EMA gains least for that reason. The results are identical either way: a test compares them bar for bar.
      </p>
      <Callout kind="note" title="If workers cannot start">
        <p>
          Workers start from a <code>blob:</code> address. If your Content-Security-Policy&apos;s <code>worker-src</code> does not allow{' '}
          <code>blob:</code>, the chart quietly computes on the main thread instead. Nothing breaks.
        </p>
      </Callout>
      <PageNav slug="performance" />
    </>
  )
}
