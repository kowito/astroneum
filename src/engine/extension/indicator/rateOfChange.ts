import type { IndicatorTemplate } from '../../component/Indicator'

interface Roc {
  roc?: number
  maRoc?: number
}

/**
 * 变动率指标
 * 公式：ROC = (CLOSE - REF(CLOSE, N)) / REF(CLOSE, N)
 */
const rateOfChange: IndicatorTemplate<Roc, number> = {
  name: 'ROC',
  shortName: 'ROC',
  calcParams: [12, 6],
  figures: [
    { key: 'roc', title: 'ROC: ', type: 'line' },
    { key: 'maRoc', title: 'MAROC: ', type: 'line' }
  ],
  calc: (dataList, indicator) => {
    const params = indicator.calcParams
    const result: Roc[] = []
    let rocSum = 0
    dataList.forEach((kLineData, i) => {
      const roc: Roc = {}
      if (i >= params[0] - 1) {
        const close = kLineData.close
        const agoClose = (dataList[i - params[0]] ?? dataList[i - (params[0] - 1)]).close
        if (agoClose !== 0) {
          roc.roc = (close - agoClose) / agoClose * 100
        } else {
          roc.roc = 0
        }
        rocSum += roc.roc
        if (i >= params[0] - 1 + params[1] - 1) {
          roc.maRoc = rocSum / params[1]
          rocSum -= (result[i - (params[1] - 1)].roc ?? 0)
        }
      }
      result.push(roc)
    })
    return result
  }
}

export default rateOfChange
