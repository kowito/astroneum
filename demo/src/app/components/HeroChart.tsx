'use client'

import 'astroneum/style.css'
import { useEffect, useMemo, useState } from 'react'
import {
  AstroneumChart,
  DATAFEED_ERROR_EVENT,
  STANDARD_CRYPTO_SYMBOLS,
  createStandardCryptoDatafeed,
  type Period,
} from 'astroneum'

const PERIOD: Period = { multiplier: 1, timespan: 'minute', text: '1m' }
const STYLES = { candle: { type: 'area' as const } }

/** A live BTC area chart for the home page: no indicators, no drawing bar. */
export default function HeroChart() {
  const datafeed = useMemo(() => createStandardCryptoDatafeed({ smoothingDuration: 320 }), [])
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    const onError = (): void => { setUnavailable(true) }
    window.addEventListener(DATAFEED_ERROR_EVENT, onError)
    return () => { window.removeEventListener(DATAFEED_ERROR_EVENT, onError) }
  }, [])

  return (
    <>
      <AstroneumChart
        symbol={STANDARD_CRYPTO_SYMBOLS[0]}
        period={PERIOD}
        datafeed={datafeed}
        theme="dark"
        styles={STYLES}
        drawingBarVisible={false}
        mainIndicators={[]}
        subIndicators={[]}
        style={{ width: '100%', height: '100%' }}
      />
      {unavailable && (
        <p className="lp-hero-note">Live prices are unavailable from here right now.</p>
      )}
    </>
  )
}
