import type { IndicatorTemplate } from '../../component/Indicator'

interface Zigzag {
  zigzag?: number
}

/**
 * ZZ - ZigZag
 *
 * Plots lines connecting significant highs and lows.
 * A pivot high/low is identified when price reverses by at least
 * the deviation percentage (default 5%) from the previous pivot.
 *
 * The indicator filters out minor price movements, showing only
 * meaningful trend changes.
 *
 * Default params: [5] (5% minimum deviation)
 */
const zigzag: IndicatorTemplate<Zigzag, number> = {
  name: 'ZZ',
  shortName: 'ZZ',
  series: 'price',
  calcParams: [5],
  precision: 2,
  shouldOhlc: true,
  figures: [
    { key: 'zigzag', title: 'ZZ: ', type: 'line' }
  ],
  calc: (dataList, indicator) => {
    const params = indicator.calcParams
    const deviationPct = params[0] / 100
    const result: Zigzag[] = dataList.map(() => ({}))

    if (dataList.length < 3) return result

    // Determine initial direction and first pivot
    let direction = dataList[1].close > dataList[0].close ? 1 : -1
    let extremeIdx = 0
    let extremeVal = direction === 1 ? dataList[0].high : dataList[0].low

    for (let i = 1; i < dataList.length; i++) {
      if (direction === 1) {
        // Uptrend — track the highest high
        if (dataList[i].high >= extremeVal) {
          extremeIdx = i
          extremeVal = dataList[i].high
        }
        // Check reversal: price drops significantly from the extreme high
        const dropPct = (extremeVal - dataList[i].low) / extremeVal
        if (dropPct >= deviationPct) {
          // Mark the peak at the extreme bar
          result[extremeIdx].zigzag = extremeVal
          // Flip to downtrend — start tracking lows from current bar
          direction = -1
          extremeIdx = i
          extremeVal = dataList[i].low
        }
      } else {
        // Downtrend — track the lowest low
        if (dataList[i].low <= extremeVal) {
          extremeIdx = i
          extremeVal = dataList[i].low
        }
        // Check reversal: price rises significantly from the extreme low
        const risePct = (dataList[i].high - extremeVal) / extremeVal
        if (risePct >= deviationPct) {
          // Mark the trough at the extreme bar
          result[extremeIdx].zigzag = extremeVal
          // Flip to uptrend — start tracking highs from current bar
          direction = 1
          extremeIdx = i
          extremeVal = dataList[i].high
        }
      }
    }

    return result
  }
}

export default zigzag
