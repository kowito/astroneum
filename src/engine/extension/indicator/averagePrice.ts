import type { IndicatorTemplate } from '../../component/Indicator'

interface Avp {
  avp?: number
}

/**
 * average price
 */
const averagePrice: IndicatorTemplate<Avp> = {
  name: 'AVP',
  shortName: 'AVP',
  series: 'price',
  precision: 2,
  figures: [
    { key: 'avp', title: 'AVP: ', type: 'line' }
  ],
  calc: (dataList) => {
    let totalTurnover = 0
    let totalVolume = 0
    return dataList.map((candleData) => {
      const avp: Avp = {}
      const turnover = candleData.turnover ?? 0
      const volume = candleData.volume ?? 0
      totalTurnover += turnover
      totalVolume += volume
      if (totalVolume !== 0) {
        avp.avp = totalTurnover / totalVolume
      }
      return avp
    })
  }
}

export default averagePrice
