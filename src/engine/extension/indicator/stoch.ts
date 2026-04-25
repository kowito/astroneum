import type { CandleData } from '../../common/Data'
import type { IndicatorTemplate } from '../../component/Indicator'

import { getMaxMin } from '../../common/utils/number'

interface Kdj {
  k?: number
  d?: number
  j?: number
}

/**
 * KDJ
 *
 * 当日K值=2/3×前一日K值+1/3×当日RSV
 * 当日D值=2/3×前一日D值+1/3×当日K值
 * 若无前一日K 值与D值，则可分别用50来代替。
 * J值=3*当日K值-2*当日D值
 */
const stoch: IndicatorTemplate<Kdj, number> = {
  name: 'KDJ',
  shortName: 'KDJ',
  calcParams: [9, 3, 3],
  figures: [
    { key: 'k', title: 'K: ', type: 'line' },
    { key: 'd', title: 'D: ', type: 'line' },
    { key: 'j', title: 'J: ', type: 'line' }
  ],
  calc: (dataList, indicator) => {
    const params = indicator.calcParams
    const result: Kdj[] = []
    dataList.forEach((candleData, i) => {
      const kdj: Kdj = {}
      const close = candleData.close
      if (i >= params[0] - 1) {
        const lhn = getMaxMin<CandleData>(dataList.slice(i - (params[0] - 1), i + 1), 'high', 'low')
        const hn = lhn[0]
        const ln = lhn[1]
        const hnSubLn = hn - ln
        const rsv = (close - ln) / (hnSubLn === 0 ? 1 : hnSubLn) * 100
        kdj.k = ((params[1] - 1) * (result[i - 1]?.k ?? 50) + rsv) / params[1]
        kdj.d = ((params[2] - 1) * (result[i - 1]?.d ?? 50) + kdj.k) / params[2]
        kdj.j = 3.0 * kdj.k - 2.0 * kdj.d
      }
      result.push(kdj)
    })
    return result
  }
}

export default stoch
