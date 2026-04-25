// @ts-nocheck

import type { IndicatorTemplate } from '../../component/Indicator'

interface Bias {
  bias1?: number
  bias2?: number
  bias3?: number
}

/**
 * BIAS
 * 乖离率=[(当日收盘价-N日平均价)/N日平均价]*100%
 */
const bias: IndicatorTemplate<Bias, number> = {
  name: 'BIAS',
  shortName: 'BIAS',
  calcParams: [6, 12, 24],
  figures: [
    { key: 'bias1', title: 'BIAS6: ', type: 'line' },
    { key: 'bias2', title: 'BIAS12: ', type: 'line' },
    { key: 'bias3', title: 'BIAS24: ', type: 'line' }
  ],
  regenerateFigures: (params) => params.map((p, i) => ({ key: `bias${i + 1}`, title: `BIAS${p}: `, type: 'line' })),
  calc: (dataList, indicator) => {
    const { calcParams: params, figures } = indicator
    const closeSums: number[] = []
    return dataList.map((candleData, i) => {
      const bias: Bias = {}
      const close = candleData.close
      params.forEach((p, index) => {
        closeSums[index] = (closeSums[index] ?? 0) + close
        if (i >= p - 1) {
          const mean = closeSums[index] / params[index]
          bias[figures[index].key] = (close - mean) / mean * 100

          closeSums[index] -= dataList[i - (p - 1)].close
        }
      })
      return bias
    })
  }
}

export default bias
