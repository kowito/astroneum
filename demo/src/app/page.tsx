import Link from 'next/link'

import { CHART_TYPE_INFO } from '../chartTypeInfo'
import { DOCS, NPM_URL, REPO_URL, asset } from '../site'
import CopyButton from './components/CopyButton'
import HeroChartLoader from './components/HeroChartLoader'
import './landing.css'

const INSTALL = 'npm install astroneum'

const QUICK_START = `import { AstroneumChart, createStandardCryptoDatafeed, STANDARD_CRYPTO_SYMBOLS } from 'astroneum'
import 'astroneum/style.css'

const datafeed = createStandardCryptoDatafeed()

export default function App() {
  return (
    <AstroneumChart
      symbol={STANDARD_CRYPTO_SYMBOLS[0]}
      period={{ multiplier: 1, timespan: 'hour', text: '1H' }}
      datafeed={datafeed}
      theme="dark"
      style={{ width: '100%', height: 560 }}
    />
  )
}`

const FEATURES = [
  {
    title: 'Every chart type',
    text: 'Candlestick, hollow candles, OHLC bars, line, area, Heikin-Ashi, Renko and range bars, all updating live.',
    href: '#chart-types',
    cta: 'See them all',
  },
  {
    title: '50 indicators',
    text: 'Moving averages, MACD, RSI, Bollinger Bands, Ichimoku and more. Add your own with plugins or the Pine-style script editor.',
  },
  {
    title: 'Drawing tools',
    text: 'Trend lines, Fibonacci, Gann, pitchforks, Elliott waves and harmonic patterns, with magnet snapping, undo and redo.',
  },
  {
    title: 'Live data',
    text: 'Real-time crypto feeds built in. Bring any other source with a four-method datafeed interface and smooth tick animation.',
    href: '/docs/datafeeds/',
    cta: 'Datafeed guide',
  },
  {
    title: 'Fast by design',
    text: 'WebGL2 rendering with a Canvas2D fallback. Optional Web Worker indicators and an offline history cache for large datasets.',
    href: '/docs/performance/',
    cta: 'Speed and offline',
  },
  {
    title: 'Built for apps',
    text: 'TypeScript types, SSR-safe for Next.js, 18 languages, and dark, light and high-contrast themes.',
  },
]

const LINKS = [
  { label: 'GitHub', href: REPO_URL, note: 'Source and issues' },
  { label: 'npm', href: NPM_URL, note: 'astroneum' },
  { label: 'Docs', href: '/docs/', note: 'Step-by-step guides with live examples' },
  { label: 'API reference', href: DOCS.api, note: 'Props, methods, exports' },
  { label: 'Datafeed guide', href: DOCS.datafeeds, note: 'Connect your data' },
  { label: 'Plugin guide', href: DOCS.plugins, note: 'Custom indicators' },
  { label: 'Changelog', href: DOCS.changelog, note: 'What changed' },
]

// Links published before the demo moved to /demo/ look like /?type=line. Send
// them on before the page paints, so there is no flash of the home page.
const LEGACY_REDIRECT = `if (new URLSearchParams(location.search).has('type')) { location.replace(${JSON.stringify(asset('/demo/'))} + location.search) }`

export default function HomePage() {
  return (
    <div className="lp">
      <script dangerouslySetInnerHTML={{ __html: LEGACY_REDIRECT }} />

      <header className="lp-nav">
        <Link href="/" className="lp-logo">Astroneum</Link>
        <nav aria-label="Primary">
          <Link href="/demo/">Demo</Link>
          <a href="#chart-types">Chart types</a>
          <a href="#get-started">Get started</a>
          <Link href="/docs/">Docs</Link>
          <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>
        </nav>
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-hero-copy">
            <p className="lp-eyebrow">Open-source charting library for React</p>
            <h1>Professional financial charts, ready out of the box</h1>
            <p className="lp-lead">
              Candlesticks to Renko, 50 indicators, drawing tools and live data.
              TradingView-class features under the MIT license, with no fees.
            </p>
            <div className="lp-actions">
              <Link href="/demo/" className="lp-button lp-button-primary">Open the live demo</Link>
              <a href="#get-started" className="lp-button">Get started</a>
            </div>
            <div className="lp-install">
              <code>{INSTALL}</code>
              <CopyButton text={INSTALL} />
            </div>
          </div>
          <div className="lp-hero-chart" aria-label="Live Bitcoin price chart">
            <HeroChartLoader />
          </div>
        </section>

        <section className="lp-section" aria-labelledby="features">
          <h2 id="features">Everything a trading UI needs</h2>
          <div className="lp-features">
            {FEATURES.map(feature => (
              <article key={feature.title} className="lp-card">
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
                {feature.href !== undefined && (feature.href.startsWith('/')
                  ? <Link href={feature.href}>{feature.cta} →</Link>
                  : <a href={feature.href} {...(feature.href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}>{feature.cta} →</a>)}
              </article>
            ))}
          </div>
        </section>

        <section className="lp-section" id="chart-types" aria-labelledby="chart-types-title">
          <h2 id="chart-types-title">One market, eight ways to draw it</h2>
          <p className="lp-section-lead">
            Each type runs on live data. Open one to try it, then switch between them in the demo.
          </p>
          <div className="lp-gallery">
            {CHART_TYPE_INFO.map(type => (
              <Link key={type.id} href={`/demo/?type=${type.id}`} className="lp-tile">
                <img
                  src={asset(`/gallery/${type.id}.webp`)}
                  alt={`${type.label} chart of the Bitcoin price`}
                  width={900}
                  height={320}
                  loading="lazy"
                />
                <span className="lp-tile-body">
                  <strong>{type.label}</strong>
                  <span>{type.description}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="lp-section" id="get-started" aria-labelledby="get-started-title">
          <h2 id="get-started-title">Get started in a minute</h2>
          <ol className="lp-steps">
            <li>
              <span>Install the package. React 18 or 19 is a peer dependency.</span>
              <div className="lp-install">
                <code>{INSTALL}</code>
                <CopyButton text={INSTALL} />
              </div>
            </li>
            <li>
              <span>Render a chart with a datafeed.</span>
              <div className="lp-code">
                <CopyButton text={QUICK_START} label="Copy code" />
                <pre><code>{QUICK_START}</code></pre>
              </div>
            </li>
          </ol>
          <p className="lp-more">
            New to charting libraries? The <Link href="/docs/getting-started/">step-by-step guide</Link> builds a working chart in ten
            steps, with a live example next to every one.
          </p>
        </section>

        <section className="lp-section" aria-labelledby="resources">
          <h2 id="resources">Resources</h2>
          <div className="lp-links">
            {LINKS.map(link => link.href.startsWith('/')
              ? (
                <Link key={link.label} href={link.href} className="lp-link">
                  <strong>{link.label}</strong>
                  <span>{link.note}</span>
                </Link>
                )
              : (
                <a key={link.label} href={link.href} target="_blank" rel="noreferrer" className="lp-link">
                  <strong>{link.label}</strong>
                  <span>{link.note}</span>
                </a>
                ))}
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <span>Astroneum is MIT licensed. Free to use anywhere, no branding required.</span>
        <span>
          <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>
          {' · '}
          <a href={NPM_URL} target="_blank" rel="noreferrer">npm</a>
        </span>
      </footer>
    </div>
  )
}
