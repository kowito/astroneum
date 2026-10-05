import type { Metadata } from 'next'
import Link from 'next/link'

import { DOC_SECTIONS } from '../../docs/nav'
import CodeBlock from './_components/CodeBlock'
import Callout from './_components/Callout'
import Diagram from './_components/Diagram'
import DocCards from './_components/DocCards'
import MockChart from './_components/MockChart'
import PageNav from './_components/PageNav'

export const metadata: Metadata = {
  title: { absolute: 'Documentation · Astroneum' },
  description: 'What Astroneum is, how the pieces fit together, and where to start.',
}

const FIRST_CHART = `import { AstroneumChart } from 'astroneum'
import 'astroneum/style.css'

export default function App() {
  return (
    <AstroneumChart
      symbol={symbol}
      period={{ multiplier: 1, timespan: 'minute', text: '1m' }}
      datafeed={datafeed}
      theme="dark"
      style={{ width: '100%', height: 420 }}
    />
  )
}`

export default function OverviewPage() {
  const guides = DOC_SECTIONS.flatMap(section => section.pages).filter(page => page.slug !== '')
  return (
    <>
      <h1>Astroneum documentation</h1>
      <p className="dc-lead">
        Astroneum is a React charting library for financial data: candlesticks and eight other chart
        types, about 50 indicators, drawing tools and live updates. These guides use real charts you
        can drag, zoom and click, so you see what each setting does.
      </p>

      <h2 id="pick-a-path">Where to start</h2>
      <DocCards pages={guides} />

      <h2 id="a-chart-in-twelve-lines">A chart in twelve lines</h2>
      <p>
        This is the whole component. The chart on the right is it, running on a simulated market. It
        updates every second; drag it to pan, scroll to zoom.
      </p>
      <div className="dc-pair">
        <CodeBlock code={FIRST_CHART} title="App.tsx" />
        <MockChart height={380} subIndicators={['VOL']} eager />
      </div>
      <Callout kind="tip">
        <p>
          <code>symbol</code> and <code>datafeed</code> come from you. The <Link href="/docs/datafeeds/">Datafeeds</Link>{' '}
          guide shows how little a datafeed needs: four functions.
        </p>
      </Callout>

      <h2 id="the-big-picture">The big picture</h2>
      <p>
        Astroneum is a React component on top of a drawing engine. You give it a datafeed (where bars
        come from) and some settings; the engine turns bars into pixels.
      </p>
      <Diagram
        doc="architecture.md"
        id="big-picture"
        label="Layers from top to bottom: your app supplies props and a datafeed; the React layer holds the AstroneumChart component and the toolbars; the engine holds the store, the chart and the views; the views draw on a canvas."
        caption="Your app supplies a datafeed and props. The engine does the drawing, without any React."
      />
      <PageNav slug="" />
    </>
  )
}
