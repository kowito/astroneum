import type { Metadata } from 'next'
import Link from 'next/link'

import Diagram from '../_components/Diagram'
import PageNav from '../_components/PageNav'
import PaneAnatomy from '../_components/PaneAnatomy'

export const metadata: Metadata = {
  title: 'How it works',
  description: 'The parts of an Astroneum chart and how data moves through them: the layers, the screen, loading, live updates, indicators.',
}

export default function HowItWorksPage() {
  return (
    <>
      <h1>How it works</h1>
      <p className="dc-lead">
        A picture of the parts of Astroneum and how data moves through them. Read this when you want to know <em>why</em> the chart
        behaves the way it does.
      </p>

      <h2 id="the-big-picture">The big picture</h2>
      <p>
        Astroneum is a React component on top of a drawing engine. Your app gives it a <strong>datafeed</strong> (where the bars come
        from) and settings; the engine turns bars into pixels.
      </p>
      <Diagram
        doc="architecture.md"
        id="big-picture"
        label="Layers from top to bottom: your app supplies props and a datafeed; the React layer holds the AstroneumChart component and the toolbars; the engine holds the store, the chart and the views; the views draw on a canvas."
      />
      <ul>
        <li><strong>The engine knows nothing about React.</strong> It takes a container element and draws into it. That keeps the drawing fast and testable.</li>
        <li><strong>The React layer is glue.</strong> It creates the engine, passes props in, and renders the dialogs and toolbars around the canvas.</li>
        <li><strong>The datafeed is the only thing you must provide.</strong> Everything else has a default.</li>
      </ul>

      <h2 id="what-is-on-screen">What is on screen</h2>
      <p>Hover or tab through the parts to see what each one is and which prop controls it.</p>
      <PaneAnatomy />
      <p>
        Every pane stacks a <strong>main canvas</strong> for the data (bars, lines, indicator values) and an <strong>overlay canvas</strong> on top
        for things that change constantly, like the crosshair and the drawing you are making. The overlay repaints without redrawing
        every bar.
      </p>

      <h2 id="the-life-of-data">The life of data</h2>
      <h3 id="first-load">First load</h3>
      <Diagram
        doc="architecture.md"
        id="first-load"
        label="A sequence: the app mounts the chart; the chart store asks for data; the React layer calls getHistoryData on the datafeed for about 500 bars; the bars come back oldest first; the store replaces its data, calculates indicators and draws; then it subscribes to live updates."
      />
      <h3 id="live-updates">Live updates</h3>
      <p>
        Once subscribed, the datafeed calls the chart&apos;s callback with the newest bar. The chart compares timestamps with the last
        bar it has. You can try this rule by hand in <Link href="/docs/getting-started/#step-4">Getting started, step 4</Link>.
      </p>
      <Diagram
        doc="architecture.md"
        id="live-updates"
        label="Flow: when the datafeed calls callback with a bar, compare its timestamp with the last bar. Greater adds a new bar; equal overwrites the last bar in place; smaller is ignored. Then indicators are recalculated, batched, the vertical scale is fitted to what is visible, and the chart redraws."
      />
      <ul>
        <li>Recalculation is <strong>batched</strong>. If ten ticks arrive in the same instant, indicators are calculated once, with the latest data.</li>
        <li>A tick that only changes the last bar takes a lighter layout path than a new bar, because the axis width cannot have changed.</li>
      </ul>
      <h3 id="scrolling-back">Scrolling back in time</h3>
      <Diagram
        doc="architecture.md"
        id="scroll-back"
        label="A sequence: the user drags the chart right until the oldest loaded bar is visible; the store asks for older bars; the datafeed returns an earlier range; the store puts them in front of the existing bars, and the view does not jump because it is measured from the newest bar. An empty answer means there is no more history and stops further requests."
      />

      <h2 id="indicators">How indicators are calculated</h2>
      <p>
        An indicator is a function from bars to numbers, plus a description of how to draw them. New data marks indicators stale; after a
        brief wait (so a burst of ticks costs one calculation) the work is queued at background priority and the panes redraw when it
        finishes.
      </p>
      <Diagram
        doc="architecture.md"
        id="indicator-pipeline"
        label="Flow: new bars mark indicators as stale, wait one moment to batch, queue the work at background priority; the calculation returns values or a promise; results are stored and the panes redraw."
      />
      <p>
        The calculation may return a promise, which is how the optional <Link href="/docs/performance/">indicator workers</Link> plug in
        without changing anything else.
      </p>

      <h2 id="where-the-code-lives">Where the code lives</h2>
      <Diagram
        doc="architecture.md"
        id="code-map"
        label="The folders under src: chart (AstroneumChart and features), widget (toolbars and dialogs), engine (store, panes, views, indicators, workers), datafeed, extension (drawing tools), entries (subpath imports), i18n (18 languages) and scripting (the script editor)."
      />
      <table>
        <thead><tr><th>Folder</th><th>Purpose</th></tr></thead>
        <tbody>
          <tr><td><code>src/chart</code></td><td><code>AstroneumChart</code> and chart-level features: replay, multi-chart, alerts, templates, transformed datafeeds</td></tr>
          <tr><td><code>src/engine</code></td><td>The drawing engine: store, panes, views, about 50 indicators, optional workers</td></tr>
          <tr><td><code>src/widget</code></td><td>The UI around the canvas: period bar, drawing bar, dialogs</td></tr>
          <tr><td><code>src/datafeed</code></td><td>The built-in datafeeds, the binary codec and the history cache</td></tr>
          <tr><td><code>src/extension</code></td><td>The drawing tools: Fibonacci, Gann, pitchforks and more</td></tr>
          <tr><td><code>src/entries</code></td><td>One tiny file per subpath import such as <code>astroneum/replay</code></td></tr>
          <tr><td><code>demo/</code></td><td>This website and the live demo (a Next.js app)</td></tr>
        </tbody>
      </table>

      <h2 id="for-contributors">For contributors: releases and deploys</h2>
      <p>Merging to <code>main</code> does the work. Nobody runs a release by hand for a beta; a stable release is a deliberate click.</p>
      <Diagram
        doc="architecture.md"
        id="release-pipeline"
        label="Flow: open a pull request; if it touches src, package.json or the lockfile the Benchmark check runs. Merge to main. Auto Version Bump runs lint, typecheck, build and test, picks the next beta number, publishes to npm with the beta tag, then commits and tags the version. If demo or src changed, the demo site is built and deployed to GitHub Pages."
      />
      <table>
        <thead><tr><th>Bump type</th><th>Example: from <code>0.4.1-beta.7</code></th><th>Use it for</th></tr></thead>
        <tbody>
          <tr><td><code>prerelease</code></td><td><code>0.4.1-beta.8</code></td><td>another beta (what a merge does)</td></tr>
          <tr><td><code>patch</code></td><td><code>0.4.1</code></td><td>bug fixes only</td></tr>
          <tr><td><code>minor</code></td><td><code>0.5.0</code></td><td>new features</td></tr>
          <tr><td><code>major</code></td><td><code>1.0.0</code></td><td>breaking changes, after 1.0</td></tr>
        </tbody>
      </table>
      <p>
        On GitHub: <strong>Actions, Auto Version Bump, Run workflow</strong>. A published npm version can never be reused, so a bump to a number
        that already exists fails.
      </p>
      <PageNav slug="how-it-works" />
    </>
  )
}
