import type { IndicatorTemplate } from '../../component/Indicator'

interface Obv {
  obv?: number
  maObv?: number
}

/**
 * OBV
 * OBV = REF(OBV) + sign * V
 */
const onBalanceVolume: IndicatorTemplate<Obv, number> = {
  name: 'OBV',
  shortName: 'OBV',
  calcParams: [30],
  figures: [
    { key: 'obv', title: 'OBV: ', type: 'line' },
    { key: 'maObv', title: 'MAOBV: ', type: 'line' }
  ],
  calc: (dataList, indicator) => {
    const params = indicator.calcParams
    let obvSum = 0
    let oldObv = 0
    const result: Obv[] = []
    dataList.forEach((candleData, i) => {
      const prevCandleData = dataList[i - 1] ?? candleData
      if (candleData.close < prevCandleData.close) {
        oldObv -= (candleData.volume ?? 0)
      } else if (candleData.close > prevCandleData.close) {
        oldObv += (candleData.volume ?? 0)
      }
      const obv: Obv = { obv: oldObv }
      obvSum += oldObv
      if (i >= params[0] - 1) {
        obv.maObv = obvSum / params[0]
        obvSum -= (result[i - (params[0] - 1)].obv ?? 0)
      }
      result.push(obv)
    })
    return result
  }
}

export default onBalanceVolume
