import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * SSR smoke test.
 *
 * Asserts that importing the library on the server (no `window`,
 * no `document`, no `localStorage`) does not throw. Next.js App Router
 * evaluates Client Modules on the server during the prerender pass, so
 * top-level access to DOM globals would crash the build.
 *
 * We do NOT render any component here — that requires `react-dom/server`
 * and is out of scope for a smoke test. The contract is "import is safe."
 */

const entries = [
  '../../dist/index.js',
  '../../dist/entries/replay.js',
  '../../dist/entries/multichart.js',
  '../../dist/entries/watchlist.js',
  '../../dist/entries/portfolio.js',
  '../../dist/entries/alerts.js',
  '../../dist/entries/script.js',
  '../../dist/entries/datafeeds/polygon.js',
  '../../dist/entries/datafeeds/crypto.js',
  '../../dist/entries/datafeeds/webtransport.js',
] as const

for (const entry of entries) {
  test(`SSR import: ${entry}`, async () => {
    const mod = await import(entry)
    assert.ok(mod, `entry ${entry} returned no exports`)
  })
}

test('root entry exposes the documented top-level API', async () => {
  const mod = await import('../../dist/index.js')
  const expected = [
    'AstroneumChart',
    'DefaultDatafeed',
    'WebSocketDatafeed',
    'MultiChartLayout',
    'BarReplay',
    'AlertManager',
    'WatchlistManager',
    'PortfolioTracker',
    'PerformanceMode',
    'ScriptEngine',
    'DrawingTemplates',
    'loadLocales',
    'createStandardCryptoDatafeed',
    'STANDARD_CRYPTO_SYMBOLS',
    'DATAFEED_ERROR_EVENT',
    'EventBus',
    'TickAnimator',
    'RingBuffer',
    'registerIndicatorPlugin',
  ]
  for (const name of expected) {
    assert.ok(name in mod, `expected export "${name}" missing from root entry`)
  }
})
