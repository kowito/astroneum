import type { Metadata } from 'next'

import { REPO_URL } from '../../../site'
import Callout from '../_components/Callout'
import PageNav from '../_components/PageNav'

export const metadata: Metadata = {
  title: 'Reference',
  description: 'The AstroneumChart props, the handle methods, the chart type values and the package imports at a glance.',
}

const API_URL = `${REPO_URL}/blob/main/docs/api.md`

export default function ReferencePage() {
  return (
    <>
      <h1>Reference</h1>
      <p className="dc-lead">
        The things you reach for most, in one place. Every prop, type and export is in the{' '}
        <a href={API_URL} target="_blank" rel="noreferrer">full API reference</a> on GitHub.
      </p>

      <h2 id="props">AstroneumChart props</h2>
      <table>
        <thead><tr><th>Prop</th><th>Type</th><th>What it does</th></tr></thead>
        <tbody>
          <tr><td><code>symbol</code></td><td><code>SymbolInfo</code></td><td>The symbol to show. <strong>Required.</strong></td></tr>
          <tr><td><code>period</code></td><td><code>Period</code></td><td>The timeframe, e.g. <code>{'{ multiplier: 1, timespan: \'hour\', text: \'1H\' }'}</code>. <strong>Required.</strong></td></tr>
          <tr><td><code>datafeed</code></td><td><code>Datafeed</code></td><td>Where bars come from. <strong>Required.</strong> Read when the chart mounts, so use a new <code>key</code> to change it.</td></tr>
          <tr><td><code>theme</code></td><td><code>&apos;dark&apos; | &apos;light&apos;</code></td><td>The theme. Follows the operating system if left out.</td></tr>
          <tr><td><code>styles</code></td><td><code>DeepPartial&lt;Styles&gt;</code></td><td>Style overrides, including the chart type: <code>{'{ candle: { type: \'line\' } }'}</code>. Applies live.</td></tr>
          <tr><td><code>mainIndicators</code></td><td><code>{'{ name, calcParams? }[]'}</code></td><td>Indicators drawn on the price chart. EMA 7, 25 and 99 if left out. Follows changes.</td></tr>
          <tr><td><code>subIndicators</code></td><td><code>string[]</code></td><td>Indicators in their own panes (<code>[&apos;VOL&apos;]</code> by default). Follows changes.</td></tr>
          <tr><td><code>historyCache</code></td><td><code>boolean | {'{ namespace?, maxBars? }'}</code></td><td>Save loaded bars in the browser. Off by default.</td></tr>
          <tr><td><code>periods</code></td><td><code>Period[]</code></td><td>The timeframes offered in the period bar.</td></tr>
          <tr><td><code>drawingBarVisible</code></td><td><code>boolean</code></td><td>Show the drawing tools on the left. <code>true</code> by default.</td></tr>
          <tr><td><code>locale</code>, <code>timezone</code></td><td><code>string</code></td><td>Language (18 built in) and IANA time zone.</td></tr>
          <tr><td><code>plugins</code></td><td><code>ChartPlugin[]</code></td><td>Plugins mounted with the chart.</td></tr>
          <tr><td><code>accessible</code></td><td><code>boolean</code></td><td>Make the chart focusable and announce the crosshair prices to screen readers.</td></tr>
          <tr><td><code>priceScale</code></td><td><code>&apos;linear&apos; | &apos;log&apos; | &apos;percent&apos;</code></td><td>How the price axis is scaled.</td></tr>
          <tr><td><code>watermark</code></td><td><code>string | Node</code></td><td>What is drawn faintly behind the bars. The Astroneum logo if left out.</td></tr>
          <tr><td><code>ariaLabel</code></td><td><code>string</code></td><td>The label a screen reader announces for the chart. Used with <code>accessible</code>.</td></tr>
          <tr><td><code>barStyle</code></td><td><code>&apos;candle&apos; | &apos;heikin_ashi&apos;</code></td><td>Converts <em>history</em> only. For a live Heikin-Ashi chart use <code>createTransformedDatafeed</code>.</td></tr>
          <tr><td><code>style</code>, <code>className</code></td><td></td><td>Sizing and styling of the container. Give it a height.</td></tr>
        </tbody>
      </table>

      <h2 id="handle">The handle (ref)</h2>
      <table>
        <thead><tr><th>Method</th><th>What it does</th></tr></thead>
        <tbody>
          <tr><td><code>setSymbol</code> / <code>getSymbol</code></td><td>Change or read the symbol</td></tr>
          <tr><td><code>setPeriod</code> / <code>getPeriod</code></td><td>Change or read the timeframe</td></tr>
          <tr><td><code>setTheme</code> / <code>getTheme</code></td><td>Change or read the theme</td></tr>
          <tr><td><code>setStyles</code> / <code>getStyles</code></td><td>Change or read styles</td></tr>
          <tr><td><code>setLocale</code> / <code>setTimezone</code></td><td>Language and time zone (with matching getters)</td></tr>
          <tr><td><code>serializeState</code> / <code>loadState</code></td><td>Save and restore the chart as JSON, drawings and indicators included</td></tr>
          <tr><td><code>getDataListLength</code>, <code>getLastDataTimestamp</code></td><td>How many bars are loaded, and the newest timestamp</td></tr>
          <tr><td><code>onCrosshairMove</code>, <code>setCrosshair</code></td><td>Follow or drive the crosshair, e.g. to link two charts. <code>onCrosshairMove</code> returns a function that stops listening.</td></tr>
          <tr><td><code>lockAllDrawings</code></td><td>Lock or unlock every drawing</td></tr>
        </tbody>
      </table>

      <h2 id="chart-types">Chart type values</h2>
      <table>
        <thead><tr><th>Chart type</th><th>How to get it</th></tr></thead>
        <tbody>
          <tr><td>Candlestick</td><td><code>styles.candle.type: &apos;candle_solid&apos;</code></td></tr>
          <tr><td>Hollow candles</td><td><code>&apos;candle_up_stroke&apos;</code> (also <code>&apos;candle_stroke&apos;</code>, <code>&apos;candle_down_stroke&apos;</code>)</td></tr>
          <tr><td>OHLC bars</td><td><code>&apos;ohlc&apos;</code></td></tr>
          <tr><td>Line</td><td><code>&apos;line&apos;</code></td></tr>
          <tr><td>Area</td><td><code>&apos;area&apos;</code></td></tr>
          <tr><td>Heikin-Ashi</td><td><code>createTransformedDatafeed(feed, () =&gt; heikinAshi)</code></td></tr>
          <tr><td>Renko</td><td><code>createTransformedDatafeed(feed, h =&gt; bars =&gt; generateRenko(bars, brick))</code></td></tr>
          <tr><td>Range bars</td><td><code>createTransformedDatafeed(feed, h =&gt; bars =&gt; generateRangeBars(bars, range))</code></td></tr>
        </tbody>
      </table>

      <h2 id="imports">Imports</h2>
      <table>
        <thead><tr><th>Import</th><th>You get</th></tr></thead>
        <tbody>
          <tr><td><code>astroneum</code></td><td><code>AstroneumChart</code>, <code>createStandardCryptoDatafeed</code>, <code>createTransformedDatafeed</code>, <code>heikinAshi</code>, <code>generateRenko</code>, <code>generateRangeBars</code>, <code>configureIndicatorWorkers</code>, <code>clearHistoryCache</code>, <code>registerIndicator</code>, <code>getSupportedIndicators</code>, formatters and more</td></tr>
          <tr><td><code>astroneum/style.css</code></td><td>The stylesheet. Import it once.</td></tr>
          <tr><td><code>astroneum/replay</code></td><td><code>BarReplay</code></td></tr>
          <tr><td><code>astroneum/multichart</code></td><td><code>MultiChartLayout</code></td></tr>
          <tr><td><code>astroneum/watchlist</code>, <code>portfolio</code>, <code>alerts</code>, <code>script</code></td><td><code>WatchlistManager</code>, <code>PortfolioTracker</code>, <code>AlertManager</code>, <code>ScriptEngine</code></td></tr>
          <tr><td><code>astroneum/datafeeds/crypto</code>, <code>polygon</code>, <code>webtransport</code></td><td>The datafeeds on their own</td></tr>
        </tbody>
      </table>

      <Callout kind="tip">
        <p>
          Looking for something not listed? The <a href={API_URL} target="_blank" rel="noreferrer">full API reference</a> covers every export and type, and the{' '}
          <a href={`${REPO_URL}/blob/main/CHANGELOG.md`} target="_blank" rel="noreferrer">changelog</a> lists what changed in each version.
        </p>
      </Callout>
      <PageNav slug="reference" />
    </>
  )
}
