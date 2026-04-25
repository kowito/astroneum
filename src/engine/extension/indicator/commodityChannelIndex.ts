import type { IndicatorTemplate } from '../../component/Indicator'

interface Cci {
  cci?: number
}

/**
 * CCI
 * CCI（N日）=（TP－MA）÷MD÷0.015
 * 其中，TP=（最高价+最低价+收盘价）÷3
 * MA=近N日TP价的累计之和÷N
 * MD=近N日TP - 当前MA绝对值的累计之和÷N
 *
 */
const commodityChannelIndex: IndicatorTemplate<Cci, number> = {
  name: 'CCI',
  shortName: 'CCI',
  calcParams: [20],
  figures: [
    { key: 'cci', title: 'CCI: ', type: 'line' }
  ],
  calc: (dataList, indicator) => {
    const params = indicator.calcParams
    const p = params[0] - 1
    let tpSum = 0
    const tpList: number[] = []
    return dataList.map((candleData, i) => {
      const cci: Cci = {}
      const tp = (candleData.high + candleData.low + candleData.close) / 3
      tpSum += tp
      tpList.push(tp)
      if (i >= p) {
        const maTp = tpSum / params[0]
        const sliceTpList = tpList.slice(i - p, i + 1)
        let sum = 0
        sliceTpList.forEach(tp => {
          sum += Math.abs(tp - maTp)
        })
        const md = sum / params[0]
        cci.cci = md !== 0 ? (tp - maTp) / md / 0.015 : 0
        const agoTp = (dataList[i - p].high + dataList[i - p].low + dataList[i - p].close) / 3
        tpSum -= agoTp
      }
      return cci
    })
  }
}

export default commodityChannelIndex
