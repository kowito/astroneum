// @ts-nocheck

import type { CandleData } from '../../common/Data'
import type { IndicatorTemplate } from '../../component/Indicator'

import { getMaxMin } from '../../common/utils/number'

interface Wr {
  wr1?: number
  wr2?: number
  wr3?: number
}

/**
 * WR
 * 公式 WR(N) = 100 * [ C - HIGH(N) ] / [ HIGH(N)-LOW(N) ]
 */
const williamsR: IndicatorTemplate<Wr, number> = {
  name: 'WR',
  shortName: 'WR',
  calcParams: [6, 10, 14],
  figures: [
    { key: 'wr1', title: 'WR1: ', type: 'line' },
    { key: 'wr2', title: 'WR2: ', type: 'line' },
    { key: 'wr3', title: 'WR3: ', type: 'line' }
  ],
  regenerateFigures: (params) => params.map((_, i) => ({ key: `wr${i + 1}`, title: `WR${i + 1}: `, type: 'line' })),
  calc: (dataList, indicator) => {
    const { calcParams: params, figures } = indicator
    return dataList.map((kLineData, i) => {
      const wr: Wr = {}
      const close = kLineData.close
      params.forEach((param, index) => {
        const p = param - 1
        if (i >= p) {
          const hln = getMaxMin<CandleData>(dataList.slice(i - p, i + 1), 'high', 'low')
          const hn = hln[0]
          const ln = hln[1]
          const hnSubLn = hn - ln
          wr[figures[index].key] = hnSubLn === 0 ? 0 : (close - hn) / hnSubLn * 100
        }
      })
      return wr
    })
  }
}

export default williamsR
