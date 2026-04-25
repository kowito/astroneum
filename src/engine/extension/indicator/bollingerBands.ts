import type { CandleData } from '../../common/Data'
import type { IndicatorTemplate } from '../../component/Indicator'

interface Boll {
  up?: number
  mid?: number
  dn?: number
}

/**
 * 计算布林指标中的标准差
 * @param dataList
 * @param ma
 * @return {number}
 */
function getBollMd (dataList: CandleData[], ma: number): number {
  const dataSize = dataList.length
  let sum = 0
  dataList.forEach(data => {
    const closeMa = data.close - ma
    sum += closeMa * closeMa
  })
  sum = Math.abs(sum)
  return Math.sqrt(sum / dataSize)
}

/**
 * BOLL
 */
const bollingerBands: IndicatorTemplate<Boll, number> = {
  name: 'BOLL',
  shortName: 'BOLL',
  series: 'price',
  calcParams: [20, 2],
  precision: 2,
  shouldOhlc: true,
  figures: [
    { key: 'up', title: 'UP: ', type: 'line' },
    { key: 'mid', title: 'MID: ', type: 'line' },
    { key: 'dn', title: 'DN: ', type: 'line' }
  ],
  calc: (dataList, indicator) => {
    const params = indicator.calcParams
    const p = params[0] - 1
    let closeSum = 0
    return dataList.map((kLineData, i) => {
      const close = kLineData.close
      const boll: Boll = {}
      closeSum += close
      if (i >= p) {
        boll.mid = closeSum / params[0]
        const md = getBollMd(dataList.slice(i - p, i + 1), boll.mid)
        boll.up = boll.mid + params[1] * md
        boll.dn = boll.mid - params[1] * md
        closeSum -= dataList[i - p].close
      }
      return boll
    })
  }
}

export default bollingerBands
