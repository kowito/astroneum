import type { IndicatorTemplate } from '../../component/Indicator'

interface Pvt {
  pvt?: number
}

/**
 * 价量趋势指标
 * 公式:
 * X = (CLOSE - REF(CLOSE, 1)) / REF(CLOSE, 1) * VOLUME
 * PVT = SUM(X)
 *
 */
const priceAndVolumeTrend: IndicatorTemplate<Pvt> = {
  name: 'PVT',
  shortName: 'PVT',
  figures: [
    { key: 'pvt', title: 'PVT: ', type: 'line' }
  ],
  calc: (dataList) => {
    let sum = 0
    return dataList.map((kLineData, i) => {
      const pvt: Pvt = {}
      const close = kLineData.close
      const volume = kLineData.volume ?? 1
      const prevClose = (dataList[i - 1] ?? kLineData).close
      let x = 0
      const total = prevClose * volume
      if (total !== 0) {
        x = (close - prevClose) / total
      }
      sum += x
      pvt.pvt = sum
      return pvt
    })
  }
}

export default priceAndVolumeTrend
