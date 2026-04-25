// @ts-nocheck

import type { IndicatorTemplate } from '../../component/Indicator'

interface Rsi {
  rsi1?: number
  rsi2?: number
  rsi3?: number
}

/**
 * RSI
 * RSI = SUM(MAX(CLOSE - REF(CLOSE,1),0),N) / SUM(ABS(CLOSE - REF(CLOSE,1)),N) × 100
 */
const relativeStrengthIndex: IndicatorTemplate<Rsi, number> = {
  name: 'RSI',
  shortName: 'RSI',
  calcParams: [6, 12, 24],
  figures: [
    { key: 'rsi1', title: 'RSI1: ', type: 'line' },
    { key: 'rsi2', title: 'RSI2: ', type: 'line' },
    { key: 'rsi3', title: 'RSI3: ', type: 'line' }
  ],
  regenerateFigures: (params) => params.map((_, index) => {
    const num = index + 1
    return { key: `rsi${num}`, title: `RSI${num}: `, type: 'line' }
  }),
  calc: (dataList, indicator) => {
    const { calcParams: params, figures } = indicator
    const sumCloseAs: number[] = []
    const sumCloseBs: number[] = []
    return dataList.map((candleData, dataIndex) => {
      const rsi = {}
      const prevClose = (dataList[dataIndex - 1] ?? candleData).close
      const closeDelta = candleData.close - prevClose
      params.forEach((period, index) => {
        if (closeDelta > 0) {
          sumCloseAs[index] = (sumCloseAs[index] ?? 0) + closeDelta
        } else {
          sumCloseBs[index] = (sumCloseBs[index] ?? 0) + Math.abs(closeDelta)
        }
        if (dataIndex >= period - 1) {
          if (sumCloseBs[index] !== 0) {
            rsi[figures[index].key] = 100 - (100.0 / (1 + sumCloseAs[index] / sumCloseBs[index]))
          } else {
            rsi[figures[index].key] = 0
          }
          const periodStartData = dataList[dataIndex - (period - 1)]
          const periodStartPrevData = dataList[dataIndex - period] ?? periodStartData
          const periodStartCloseDelta = periodStartData.close - periodStartPrevData.close
          if (periodStartCloseDelta > 0) {
            sumCloseAs[index] -= periodStartCloseDelta
          } else {
            sumCloseBs[index] -= Math.abs(periodStartCloseDelta)
          }
        }
      })
      return rsi
    })
  }
}

export default relativeStrengthIndex
