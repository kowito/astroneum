'use client'

import { AstroneumChart, createStandardCryptoDatafeed, STANDARD_CRYPTO_SYMBOLS } from 'astroneum'
import 'astroneum/style.css'

// Create the datafeed once, outside the component.
const datafeed = createStandardCryptoDatafeed()

export default function App() {
  return (
    <AstroneumChart
      symbol={STANDARD_CRYPTO_SYMBOLS[0]}
      period={{ multiplier: 1, timespan: 'hour', text: '1H' }}
      datafeed={datafeed}
      theme="dark"
      style={{ width: '100%', height: 360 }}
    />
  )
}
