import type { Metadata } from 'next'
import Link from 'next/link'

import FirstChart from '../../../docs/examples/FirstChart'
import HandleExample from '../../../docs/examples/HandleExample'
import OwnData from '../../../docs/examples/OwnData'
import Callout from '../_components/Callout'
import CodeBlock from '../_components/CodeBlock'
import Diagram from '../_components/Diagram'
import Example from '../_components/Example'
import MockChart from '../_components/MockChart'
import PackageTabs from '../_components/PackageTabs'
import PageNav from '../_components/PageNav'
import SourceCode from '../_components/SourceCode'
import { Step, Steps } from '../_components/Steps'
import TickSimulator from '../_components/TickSimulator'

export const metadata: Metadata = {
  title: 'Getting started',
  description: 'From an empty folder to a live, interactive chart in ten small steps, with a running example for each.',
}

const STYLE_LINE = `<AstroneumChart
  symbol={symbol}
  period={period}
  datafeed={datafeed}
  styles={{ candle: { type: 'line' } }}   // the only change
  style={{ width: '100%', height: 360 }}
/>`

const DERIVED = `import { createTransformedDatafeed, generateRenko, heikinAshi } from 'astroneum'

// Heikin-Ashi: same timestamps, smoothed values.
const heikin = createTransformedDatafeed(datafeed, () => heikinAshi)

// Renko: fixed-size bricks. The factory runs once on the loaded history,
// so the brick size stays fixed while live updates arrive.
const renko = createTransformedDatafeed(datafeed, (history) => {
  const range = history.slice(-100).reduce((sum, bar) => sum + (bar.high - bar.low), 0) / 100
  const brick = Number(range.toPrecision(2))
  return (bars) => generateRenko(bars, brick)
})

<AstroneumChart key="renko" datafeed={renko} /* ...the same props as before... */ />`

const INDICATORS = `<AstroneumChart
  symbol={symbol}
  period={period}
  datafeed={datafeed}
  mainIndicators={[{ name: 'EMA', calcParams: [7, 25, 99] }, { name: 'BOLL' }]}
  subIndicators={['VOL', 'RSI', 'MACD']}
  style={{ width: '100%', height: 460 }}
/>`

const NEXT_CONFIG = `// next.config.ts
const nextConfig = { transpilePackages: ['astroneum'] }
export default nextConfig`

const NEXT_COMPONENT = `// app/components/Chart.tsx
'use client'
import { AstroneumChart } from 'astroneum'
import 'astroneum/style.css'
// ...`

export default function GettingStartedPage() {
  return (
    <>
      <h1>Getting started</h1>
      <p className="dc-lead">
        From an empty folder to a live, interactive chart, one small step at a time. Every step ends with
        something you can see, and most come with a chart running right here.
      </p>

      <Diagram
        doc="getting-started.md"
        id="steps-overview"
        label="The ten steps in four phases: get it running (create a project, install, first chart); feed it data (how data gets in, your own data); shape the chart (chart types, indicators, control it from code); polish and ship (faster and offline, ship it)."
        caption="The blue steps matter most: a chart on screen, your own data, and the chart type you want."
      />

      <h2 id="before-you-start">Before you start</h2>
      <table>
        <thead><tr><th>You need</th><th>Version</th><th>Why</th></tr></thead>
        <tbody>
          <tr><td>Node.js</td><td>22 or newer</td><td>The package requires it (<code>engines</code>)</td></tr>
          <tr><td>React and React DOM</td><td>18 or 19</td><td>They are peer dependencies</td></tr>
          <tr><td>A bundler</td><td>Vite, Next.js, or similar</td><td>The package is ESM and ships its CSS separately</td></tr>
        </tbody>
      </table>

      <h2 id="the-steps">The ten steps</h2>
      <Steps>
        <Step id="step-1" title="Create a project">
          <p>Skip this if you already have a React app.</p>
          <CodeBlock lang="bash" code={`npm create vite@latest my-charts -- --template react-ts\ncd my-charts`} />
          <p><strong>You should see:</strong> a <code>my-charts</code> folder with <code>src/App.tsx</code> in it.</p>
        </Step>

        <Step id="step-2" title="Install Astroneum">
          <PackageTabs />
          <p><strong>You should see:</strong> <code>astroneum</code> under <code>dependencies</code> in <code>package.json</code>.</p>
        </Step>

        <Step id="step-3" title="Render your first chart">
          <p>Replace <code>src/App.tsx</code> with this. The chart below is exactly this code, running on live Bitcoin data.</p>
          <SourceCode file="docs/examples/FirstChart.tsx" title="src/App.tsx" />
          <Example label="Running: live Bitcoin from Binance" height={360}>
            <FirstChart />
          </Example>
          <p>
            <strong>You should see:</strong> a live candlestick chart with three moving-average lines (the default) and a
            volume pane underneath. Drag to pan, scroll to zoom, and use the toolbar to switch timeframe or add indicators.
          </p>
          <Callout kind="warn" title="Two things that trip people up">
            <p>
              <strong>Import the CSS.</strong> Without <code>astroneum/style.css</code> the chart renders unstyled.{' '}
              <strong>Give the chart a height.</strong> It fills its container, so a container with no height shows nothing.
            </p>
          </Callout>
          <p>If the chart above stays empty, your network may be blocking the exchange. Step 5 shows data that needs no network.</p>
        </Step>

        <Step id="step-4" title="How data gets into the chart">
          <p>
            Before using your own data, see what the chart does with a datafeed. A datafeed is an object with four
            methods. The chart calls them; you never call them yourself.
          </p>
          <Diagram
            doc="getting-started.md"
            id="datafeed-calls"
            label="A sequence: the app renders the chart; the chart asks the datafeed for history and draws it; it subscribes, then the datafeed sends the latest bar repeatedly; when you scroll back the chart asks for older bars; when the symbol or period changes it unsubscribes."
          />
          <table>
            <thead><tr><th>Method</th><th>The chart calls it when</th><th>You return</th></tr></thead>
            <tbody>
              <tr><td><code>searchSymbols(search?)</code></td><td>you type in the symbol search box</td><td><code>Promise&lt;SymbolInfo[]&gt;</code></td></tr>
              <tr><td><code>getHistoryData(symbol, period, from, to)</code></td><td>it loads the first bars, and when you scroll back</td><td><code>Promise&lt;CandleData[]&gt;</code>, oldest first</td></tr>
              <tr><td><code>subscribe(symbol, period, callback)</code></td><td>history has loaded</td><td>nothing; call <code>callback(bar)</code> for each live update</td></tr>
              <tr><td><code>unsubscribe(symbol, period)</code></td><td>the symbol or period changes</td><td>nothing; stop sending updates</td></tr>
            </tbody>
          </table>
          <p>
            A <strong>bar</strong> (<code>CandleData</code>) is <code>{'{ timestamp, open, high, low, close, volume? }'}</code>,
            with <code>timestamp</code> in milliseconds.
          </p>
          <h4 className="dc-h4">The one rule for live updates</h4>
          <p>
            Send a bar with the <em>same timestamp</em> as the latest bar to update it, or a <em>newer timestamp</em> to start
            a new bar. Older timestamps are ignored. Try it:
          </p>
          <TickSimulator />
        </Step>

        <Step id="step-5" title="Use your own data">
          <p>
            This is a complete datafeed that needs no server. It makes up a random price and keeps it moving, which is
            handy for testing. It is the code below, running:
          </p>
          <SourceCode file="docs/examples/OwnData.tsx" title="src/App.tsx" />
          <Example label="Running: the datafeed above" height={360}>
            <OwnData />
          </Example>
          <p>
            <strong>You should see:</strong> a chart of the made-up market, with the last candle twitching every second.
            That is the whole contract: history in, then a stream of updates.
          </p>
          <p>
            To connect a real source, keep the same four methods and replace the bodies with <code>fetch</code> calls and a
            WebSocket. The <Link href="/docs/datafeeds/">Datafeeds</Link> page goes further.
          </p>
        </Step>

        <Step id="step-6" title="Choose a chart type">
          <p>There are two kinds of chart type, and the difference decides how you set them up.</p>
          <Diagram
            doc="getting-started.md"
            id="chart-type-families"
            label="A decision: candlestick, hollow candles, OHLC bars, line and area are drawn from your normal bars, so you set one style. Heikin-Ashi, Renko and range bars are built from your bars by a formula, so you wrap the datafeed once."
          />
          <h4 className="dc-h4">Types the chart draws itself: one style prop</h4>
          <CodeBlock code={STYLE_LINE} />
          <MockChart typeId="line" height={340} />
          <p>
            <strong>You should see:</strong> a single price line where the candles were. You can change <code>styles</code>{' '}
            while the chart is mounted; it updates in place.
          </p>
          <h4 className="dc-h4">Types built from your data: wrap the datafeed</h4>
          <CodeBlock code={DERIVED} />
          <MockChart typeId="renko" height={340} />
          <p>
            <strong>You should see:</strong> stepped bricks that only move when the price moves a full brick. Remount with a
            different <code>key</code> when you switch datafeeds. Renko ignores time, so its time axis shows synthetic times.
          </p>
          <Callout kind="tip">
            <p>
              Want to compare them? The <Link href="/docs/chart-types/">Chart types</Link> page lets you switch between all eight
              on one chart.
            </p>
          </Callout>
        </Step>

        <Step id="step-7" title="Add indicators">
          <p>
            Indicators are props. Overlays such as moving averages draw on the price chart; everything else gets its own pane
            underneath.
          </p>
          <CodeBlock code={INDICATORS} />
          <Diagram
            doc="getting-started.md"
            id="indicator-panes"
            label="The screen from top to bottom: the main pane with candles and the main indicators, then one pane for each sub-indicator, then the time axis."
          />
          <MockChart height={470} mainIndicators={[{ name: 'EMA', calcParams: [7, 25, 99] }, { name: 'BOLL' }]} subIndicators={['VOL', 'RSI', 'MACD']} />
          <p>
            <strong>You should see:</strong> the EMA lines and a Bollinger band on the price chart, plus VOL, RSI and MACD panes
            beneath it. The props follow changes: add or remove a name and the chart updates without remounting. There are about 50
            indicators; the <Link href="/docs/indicators/">Indicators</Link> page lets you toggle them.
          </p>
        </Step>

        <Step id="step-8" title="Control the chart from code">
          <p>Attach a <code>ref</code> to get a handle. It lets your own buttons drive the chart. Click them:</p>
          <SourceCode file="docs/examples/HandleExample.tsx" title="src/App.tsx" />
          <Example label="Running: the buttons control the chart" height={360} extra={50}>
            <HandleExample />
          </Example>
          <table>
            <thead><tr><th>Method</th><th>What it does</th></tr></thead>
            <tbody>
              <tr><td><code>setSymbol(symbol)</code> / <code>getSymbol()</code></td><td>change or read the symbol</td></tr>
              <tr><td><code>setPeriod(period)</code> / <code>getPeriod()</code></td><td>change or read the timeframe</td></tr>
              <tr><td><code>setTheme(&apos;dark&apos; | &apos;light&apos; | &apos;high-contrast&apos;)</code></td><td>switch the theme</td></tr>
              <tr><td><code>setStyles(styles)</code></td><td>change chart styles, such as the chart type</td></tr>
              <tr><td><code>serializeState()</code> / <code>loadState(state)</code></td><td>save and restore the chart, drawings included</td></tr>
            </tbody>
          </table>
          <p>
            Saving the user&apos;s chart is two calls. <code>serializeState()</code> returns plain JSON, so it goes anywhere:{' '}
            <code>localStorage</code>, a URL, or your database.
          </p>
          <Diagram
            doc="getting-started.md"
            id="save-restore"
            label="The user draws lines and adds indicators; serializeState captures the chart; the result is stored in localStorage or on your server; loadState restores the same chart."
          />
        </Step>

        <Step id="step-9" title="Faster and offline (optional)">
          <p>Both features are off by default. Turn them on when you need them.</p>
          <h4 className="dc-h4">History cache</h4>
          <p>Remembers loaded bars in the browser, so a reload only fetches what is new and the chart still opens when the data source is down.</p>
          <CodeBlock code={`<AstroneumChart historyCache /* ...other props... */ />`} />
          <Diagram
            doc="getting-started.md"
            id="cache-flow"
            label="On load: if nothing is saved, fetch the full window and save it. If bars are saved, fetch only the newest; if that works and matches, merge and show; if an old bar changed, refetch everything; if offline, show the saved bars."
          />
          <h4 className="dc-h4">Indicator workers</h4>
          <p>For very long histories (tens of thousands of bars), this moves heavy indicator maths off the main thread so scrolling stays smooth.</p>
          <CodeBlock code={`import { configureIndicatorWorkers } from 'astroneum'\n\nconfigureIndicatorWorkers({ enabled: true }) // MA, EMA, RSI and BOLL, 20,000+ bars`} />
          <Diagram
            doc="getting-started.md"
            id="worker-paths"
            label="When data arrives: if only the last bar changed, recompute just that bar on the main thread; if everything changed and workers are enabled with 20,000 or more bars, compute in a Web Worker, falling back to the main thread if it fails."
          />
          <p>See <Link href="/docs/performance/">Speed and offline</Link> for a live look at the cache.</p>
        </Step>

        <Step id="step-10" title="Ship it">
          <h4 className="dc-h4">Next.js</h4>
          <p>Add the package to <code>transpilePackages</code>, and render the chart from a client component:</p>
          <CodeBlock lang="ts" code={NEXT_CONFIG} />
          <CodeBlock code={NEXT_COMPONENT} />
          <p>
            The package is safe to import on the server (it does not touch <code>window</code> at import time), so server-side
            rendering will not crash. The chart itself draws in the browser.
          </p>
          <h4 className="dc-h4">Everything else</h4>
          <p>
            Build as usual. The CSS file is separate (<code>astroneum/style.css</code>) so you control how it loads. Optional
            features are separate imports, so apps that do not use them do not pay for them:
          </p>
          <table>
            <thead><tr><th>Import</th><th>Adds</th></tr></thead>
            <tbody>
              <tr><td><code>astroneum</code></td><td>the chart and the common datafeeds</td></tr>
              <tr><td><code>astroneum/replay</code></td><td>bar replay</td></tr>
              <tr><td><code>astroneum/multichart</code></td><td>multi-chart grids</td></tr>
              <tr><td><code>astroneum/datafeeds/crypto</code></td><td>the crypto datafeed on its own</td></tr>
              <tr><td><code>astroneum/datafeeds/polygon</code></td><td>Polygon.io datafeeds</td></tr>
              <tr><td><code>astroneum/datafeeds/webtransport</code></td><td>experimental WebTransport datafeed</td></tr>
            </tbody>
          </table>
        </Step>
      </Steps>

      <h2 id="troubleshooting">Troubleshooting</h2>
      <table>
        <thead><tr><th>What you see</th><th>Why</th><th>Fix</th></tr></thead>
        <tbody>
          <tr><td>Nothing renders, no error</td><td>The container has no height</td><td>Set <code>style={'{{ height: 560 }}'}</code> or give the parent a height</td></tr>
          <tr><td>The chart looks broken or unstyled</td><td>The CSS is missing</td><td><code>import &apos;astroneum/style.css&apos;</code> once in your app</td></tr>
          <tr><td><code>window is not defined</code></td><td>Rendering on the server</td><td>In Next.js, put the chart in a component marked <code>&apos;use client&apos;</code></td></tr>
          <tr><td>Empty chart, no bars</td><td><code>getHistoryData</code> returned nothing or threw</td><td>Log what it returns; times are in <strong>milliseconds</strong>, oldest first</td></tr>
          <tr><td>Chart never updates live</td><td><code>subscribe</code> never calls <code>callback</code></td><td>Call <code>callback(bar)</code> with the same or a newer timestamp</td></tr>
          <tr><td>A new bar shows up in the wrong place</td><td>Timestamps are in seconds</td><td>Multiply by 1000</td></tr>
          <tr><td>Switching to Renko or Heikin-Ashi shows the old chart</td><td>The chart keeps its first datafeed</td><td>Give the chart a different <code>key</code> for each datafeed</td></tr>
          <tr><td><code>Unsupported engine</code> on install</td><td>Node is older than 22</td><td>Upgrade Node</td></tr>
          <tr><td>Crypto data does not load</td><td>A network or region block on the exchange</td><td>Try another symbol, or use your own datafeed</td></tr>
        </tbody>
      </table>

      <PageNav slug="getting-started" />
    </>
  )
}
