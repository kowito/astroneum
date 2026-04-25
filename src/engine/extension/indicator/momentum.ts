import type { IndicatorTemplate } from '../../component/Indicator'

interface Mtm {
  mtm?: number
  maMtm?: number
}

/**
 * mtm
 * 公式 MTM（N日）=C－CN
 */
const momentum: IndicatorTemplate<Mtm, number> = {
  name: 'MTM',
  shortName: 'MTM',
  calcParams: [12, 6],
  figures: [
    { key: 'mtm', title: 'MTM: ', type: 'line' },
    { key: 'maMtm', title: 'MAMTM: ', type: 'line' }
  ],
  calc: (dataList, indicator) => {
    const params = indicator.calcParams
    let mtmSum = 0
    const result: Mtm[] = []
    dataList.forEach((candleData, i) => {
      const mtm: Mtm = {}
      if (i >= params[0]) {
        const close = candleData.close
        const agoClose = dataList[i - params[0]].close
        mtm.mtm = close - agoClose
        mtmSum += mtm.mtm
        if (i >= params[0] + params[1] - 1) {
          mtm.maMtm = mtmSum / params[1]
          mtmSum -= (result[i - (params[1] - 1)].mtm ?? 0)
        }
      }
      result.push(mtm)
    })
    return result
  }
}

export default momentum
