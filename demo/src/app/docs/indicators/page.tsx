import type { Metadata } from 'next'
import Link from 'next/link'

import { CATEGORIES, OVERLAY_INDICATORS } from '../../../indicatorCatalogue'
import Callout from '../_components/Callout'
import CodeBlock from '../_components/CodeBlock'
import Diagram from '../_components/Diagram'
import IndicatorPlayground from '../_components/IndicatorPlayground'
import PageNav from '../_components/PageNav'

export const metadata: Metadata = {
  title: 'Indicators',
  description: 'Add moving averages, MACD, RSI, Bollinger Bands and about 50 other indicators with a prop. Toggle them on a running chart.',
}

const PARAMS = `<AstroneumChart
  mainIndicators={[
    { name: 'EMA', calcParams: [7, 25, 99] },   // three moving averages
    { name: 'BOLL', calcParams: [20, 2] },       // period 20, 2 standard deviations
  ]}
  subIndicators={['RSI', 'MACD']}               // default settings
/>`

const CHANGE_LATER = `const [indicators, setIndicators] = useState(['VOL'])

// add 'RSI' later: the chart gains a pane, without remounting
<button onClick={() => setIndicators(list => [...list, 'RSI'])}>Add RSI</button>
<AstroneumChart subIndicators={indicators} /* ... */ />`

export default function IndicatorsPage() {
  return (
    <>
      <h1>Indicators</h1>
      <p className="dc-lead">
        Indicators are props. Name the ones you want and the chart calculates and draws them, and keeps them up to date as live
        prices arrive. Tick some below.
      </p>

      <h2 id="try-them">Try them</h2>
      <IndicatorPlayground />
      <p>
        Watch the code under the chart: it is the exact props for what is on screen. Adding or removing a name updates the chart
        in place; nothing remounts.
      </p>

      <h2 id="price-chart-or-pane">On the price chart, or in a pane</h2>
      <p>
        An indicator measured in prices (a moving average, Bollinger Bands) belongs on the price chart, so it goes in{' '}
        <code>mainIndicators</code>. One with its own scale (RSI, MACD, volume) gets its own pane, so it goes in{' '}
        <code>subIndicators</code>, one pane each.
      </p>
      <Diagram
        doc="getting-started.md"
        id="indicator-panes"
        label="The screen from top to bottom: the main pane with candles and the main indicators, then one pane for each sub-indicator, then the time axis."
      />

      <h2 id="settings">Settings and changing them later</h2>
      <p>Pass <code>calcParams</code> to change an indicator&apos;s settings; leave it out for the defaults.</p>
      <CodeBlock code={PARAMS} />
      <p>The lists follow your state, so you can add and remove indicators while the chart is running:</p>
      <CodeBlock code={CHANGE_LATER} />
      <Callout kind="note">
        <p>
          Users can also add and remove indicators from the toolbar&apos;s <strong>Indicator</strong> button. Those choices and the ones
          you pass as props live side by side: a change to your props only touches the names that changed.
        </p>
      </Callout>

      <h2 id="available">What is available</h2>
      <p>
        About 50 indicators are built in. This is the list the live demo&apos;s picker offers; those marked <em>price chart</em> are overlays, and
        the rest get a pane.
      </p>
      <table>
        <thead><tr><th>Category</th><th>Indicators</th></tr></thead>
        <tbody>
          {CATEGORIES.map(({ category, items }) => (
            <tr key={category}>
              <td>{category}</td>
              <td>
                {items.map((item, i) => (
                  <span key={item.name} title={item.description}>
                    <code>{item.name}</code>{OVERLAY_INDICATORS.has(item.name) && <sup title="Drawn on the price chart"> ◆</sup>}{i < items.length - 1 ? ' ' : ''}
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="dc-footnote">◆ drawn on the price chart (<code>mainIndicators</code>). Hover a name for its description.</p>

      <h2 id="your-own">Your own indicators</h2>
      <p>
        The built-in list is not a limit. Register your own with <code>registerIndicatorPlugin</code> (a function from bars to numbers,
        with optional drawing), or write one in the in-chart script editor. The{' '}
        <a href="https://github.com/kowito/astroneum/blob/main/docs/plugin-development.md" target="_blank" rel="noreferrer">plugin guide</a> walks
        through both. For very long histories, see <Link href="/docs/performance/">Speed and offline</Link>.
      </p>
      <PageNav slug="indicators" />
    </>
  )
}
