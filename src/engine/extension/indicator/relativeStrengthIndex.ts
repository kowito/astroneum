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
    return dataList.map((kLineData, i) => {
      const rsi = {}
      const prevClose = (dataList[i - 1] ?? kLineData).close
      const tmp = kLineData.close - prevClose
      params.forEach((p, index) => {
        if (tmp > 0) {
          sumCloseAs[index] = (sumCloseAs[index] ?? 0) + tmp
        } else {
          sumCloseBs[index] = (sumCloseBs[index] ?? 0) + Math.abs(tmp)
        }
        if (i >= p - 1) {
          if (sumCloseBs[index] !== 0) {
            rsi[figures[index].key] = 100 - (100.0 / (1 + sumCloseAs[index] / sumCloseBs[index]))
          } else {
            rsi[figures[index].key] = 0
          }
          const agoData = dataList[i - (p - 1)]
          const agoPreData = dataList[i - p] ?? agoData
          const agoTmp = agoData.close - agoPreData.close
          if (agoTmp > 0) {
            sumCloseAs[index] -= agoTmp
          } else {
            sumCloseBs[index] -= Math.abs(agoTmp)
          }
        }
      })
      return rsi
    })
  }
}

export default relativeStrengthIndex
