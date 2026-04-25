import type { IndicatorTemplate } from '../../component/Indicator'

interface Emv {
  emv?: number
  maEmv?: number
}

/**
 *
 * EMV 简易波动指标
 * 公式：
 * A=（今日最高+今日最低）/2
 * B=（前日最高+前日最低）/2
 * C=今日最高-今日最低
 * EM=（A-B）*C/今日成交额
 * EMV=N日内EM的累和
 * MAEMV=EMV的M日的简单移动平均
 *
 */
const easeOfMovementValue: IndicatorTemplate<Emv, number> = {
  name: 'EMV',
  shortName: 'EMV',
  calcParams: [14, 9],
  figures: [
    { key: 'emv', title: 'EMV: ', type: 'line' },
    { key: 'maEmv', title: 'MAEMV: ', type: 'line' }
  ],
  calc: (dataList, indicator) => {
    const params = indicator.calcParams
    let emvValueSum = 0
    const emvValueList: number[] = []
    return dataList.map((candleData, i) => {
      const emv: Emv = {}
      if (i > 0) {
        const prevCandleData = dataList[i - 1]
        const high = candleData.high
        const low = candleData.low
        const volume = candleData.volume ?? 0
        const distanceMoved = (high + low) / 2 - (prevCandleData.high + prevCandleData.low) / 2

        if (volume === 0 || high - low === 0) {
          emv.emv = 0
        } else {
          const ratio = volume / 100000000 / (high - low)
          emv.emv = distanceMoved / ratio
        }
        emvValueSum += emv.emv
        emvValueList.push(emv.emv)
        if (i >= params[0]) {
          emv.maEmv = emvValueSum / params[0]
          emvValueSum -= emvValueList[i - params[0]]
        }
      }
      return emv
    })
  }
}

export default easeOfMovementValue
