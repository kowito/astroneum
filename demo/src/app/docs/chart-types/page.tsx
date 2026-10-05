import type { Metadata } from 'next'

import Callout from '../_components/Callout'
import ChartTypePlayground from '../_components/ChartTypePlayground'
import Diagram from '../_components/Diagram'
import PageNav from '../_components/PageNav'

export const metadata: Metadata = {
  title: 'Chart types',
  description: 'Candlestick, hollow candles, OHLC bars, line, area, Heikin-Ashi, Renko and range bars: try each one on a running chart.',
}

export default function ChartTypesPage() {
  return (
    <>
      <h1>Chart types</h1>
      <p className="dc-lead">
        The same market can be drawn eight ways. Some change only how the bars are drawn; others change which
        bars you see. Pick one below and the chart switches, with the code that does it.
      </p>

      <h2 id="try-them">Try them</h2>
      <ChartTypePlayground />

      <h2 id="two-families">Two families</h2>
      <p>
        The first five are a <strong>style</strong>: the chart draws your bars differently. The last three are{' '}
        <strong>derived</strong>: a formula builds new bars from yours, so they need their own datafeed. That one
        difference decides how you set each up.
      </p>
      <Diagram
        doc="architecture.md"
        id="chart-type-split"
        label="Two groups. Candlestick, hollow candles, OHLC bars, line and area are drawn from the same bars and set with styles.candle.type. Heikin-Ashi, Renko and range bars are built from the bars and use createTransformedDatafeed."
      />
      <table>
        <thead><tr><th>Chart type</th><th>Family</th><th>How you set it</th><th>Good for</th></tr></thead>
        <tbody>
          <tr><td>Candlestick</td><td>style</td><td><code>candle_solid</code> (the default)</td><td>Everyday price action</td></tr>
          <tr><td>Hollow candles</td><td>style</td><td><code>candle_up_stroke</code></td><td>Telling rising from falling at a glance</td></tr>
          <tr><td>OHLC bars</td><td>style</td><td><code>ohlc</code></td><td>Dense charts; open and close as ticks</td></tr>
          <tr><td>Line</td><td>style</td><td><code>line</code></td><td>A clean view of the close; the dot shows the live price</td></tr>
          <tr><td>Area</td><td>style</td><td><code>area</code></td><td>A line with weight, for dashboards</td></tr>
          <tr><td>Heikin-Ashi</td><td>derived</td><td><code>heikinAshi</code></td><td>Smoothing noise to read a trend</td></tr>
          <tr><td>Renko</td><td>derived</td><td><code>generateRenko</code></td><td>Filtering out small moves</td></tr>
          <tr><td>Range bars</td><td>derived</td><td><code>generateRangeBars</code></td><td>Bars that each cover the same price range</td></tr>
        </tbody>
      </table>
      <p>
        The style values go in <code>styles.candle.type</code>. There is also <code>candle_stroke</code> (every candle outlined)
        and <code>candle_down_stroke</code> (falling candles hollow).
      </p>

      <h2 id="how-derived-charts-stay-live">How derived charts stay live</h2>
      <p>
        <code>createTransformedDatafeed</code> sits between the chart and your datafeed. It keeps the raw bars, re-derives the
        series on every tick, and passes the chart only what <em>changed</em>.
      </p>
      <Diagram
        doc="architecture.md"
        id="transformed-feed"
        label="A sequence between the chart, the wrapper and your datafeed. The wrapper asks your datafeed for history, runs the factory once to choose fixed settings, and returns derived bars. For each raw tick it updates its raw bars, re-derives, compares with the last output, and sends the chart only new or changed bars, or nothing if nothing visible changed."
      />
      <ul>
        <li><strong>Switch with a new <code>key</code>.</strong> The chart reads its datafeed when it mounts, so give each derived datafeed its own <code>key</code>.</li>
        <li><strong>The factory runs once.</strong> That fixes settings such as a Renko brick size, so bricks do not repaint as ticks arrive.</li>
        <li><strong>No scrolling back.</strong> A derived series is built from the window of bars that was loaded, so scrolling past it loads nothing.</li>
        <li><strong>Renko and range bars ignore time.</strong> They use made-up timestamps, so the time axis shows synthetic times. That is expected.</li>
      </ul>

      <Callout kind="warn" title="Not in the list">
        <p>
          The package also exports <code>generateKagi</code>, <code>generateTickBars</code> and <code>generatePointAndFigure</code>, which work on a
          fixed array of bars. They are not shown here: <code>generateKagi</code> draws one bar per swing rather than classic Kagi lines, and the
          Point &amp; Figure chart renderer is a placeholder. The <code>barStyle=&quot;heikin_ashi&quot;</code> prop converts history only, so for a live
          Heikin-Ashi chart use <code>createTransformedDatafeed</code> as above.
        </p>
      </Callout>
      <PageNav slug="chart-types" />
    </>
  )
}
