'use client'

import { useRef } from 'react'
import { AstroneumChart, createStandardCryptoDatafeed, STANDARD_CRYPTO_SYMBOLS } from 'astroneum'
import type { AstroneumHandle } from 'astroneum'
import 'astroneum/style.css'

const datafeed = createStandardCryptoDatafeed()

export default function App() {
  const chart = useRef<AstroneumHandle>(null)

  return (
    <>
      <button onClick={() => chart.current?.setSymbol(STANDARD_CRYPTO_SYMBOLS[1])}>Switch symbol</button>
      <button onClick={() => chart.current?.setPeriod({ multiplier: 15, timespan: 'minute', text: '15m' })}>15m</button>
      <button onClick={() => chart.current?.setTheme('light')}>Light theme</button>
      <button onClick={() => chart.current?.setTheme('dark')}>Dark theme</button>

      <AstroneumChart
        ref={chart}
        symbol={STANDARD_CRYPTO_SYMBOLS[0]}
        period={{ multiplier: 1, timespan: 'hour', text: '1H' }}
        datafeed={datafeed}
        theme="dark"
        style={{ width: '100%', height: 360 }}
      />
    </>
  )
}
