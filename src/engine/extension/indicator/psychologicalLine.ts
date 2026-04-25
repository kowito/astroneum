import type { IndicatorTemplate } from '../../component/Indicator'

interface Psy {
  psy?: number
  maPsy?: number
}

/**
 * PSY
 * 公式：PSY=N日内的上涨天数/N×100%。
 */
const psychologicalLine: IndicatorTemplate<Psy, number> = {
  name: 'PSY',
  shortName: 'PSY',
  calcParams: [12, 6],
  figures: [
    { key: 'psy', title: 'PSY: ', type: 'line' },
    { key: 'maPsy', title: 'MAPSY: ', type: 'line' }
  ],
  calc: (dataList, indicator) => {
    const params = indicator.calcParams
    let upCount = 0
    let psySum = 0
    const upList: number[] = []
    const result: Psy[] = []
    dataList.forEach((candleData, i) => {
      const psy: Psy = {}
      const prevClose = (dataList[i - 1] ?? candleData).close
      const upFlag = candleData.close - prevClose > 0 ? 1 : 0
      upList.push(upFlag)
      upCount += upFlag
      if (i >= params[0] - 1) {
        psy.psy = upCount / params[0] * 100
        psySum += psy.psy
        if (i >= params[0] + params[1] - 2) {
          psy.maPsy = psySum / params[1]
          psySum -= (result[i - (params[1] - 1)].psy ?? 0)
        }
        upCount -= upList[i - (params[0] - 1)]
      }
      result.push(psy)
    })
    return result
  }
}

export default psychologicalLine
