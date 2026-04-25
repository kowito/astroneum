import type { IndicatorTemplate } from '../../component/Indicator'

interface Dma {
  dma?: number
  ama?: number
}

/**
 * DMA
 * 公式：DIF:MA(CLOSE,N1)-MA(CLOSE,N2);DIFMA:MA(DIF,M)
 */
const differentOfMovingAverage: IndicatorTemplate<Dma, number> = {
  name: 'DMA',
  shortName: 'DMA',
  calcParams: [10, 50, 10],
  figures: [
    { key: 'dma', title: 'DMA: ', type: 'line' },
    { key: 'ama', title: 'AMA: ', type: 'line' }
  ],
  calc: (dataList, indicator) => {
    const params = indicator.calcParams
    const maxPeriod = Math.max(params[0], params[1])
    let closeSum1 = 0
    let closeSum2 = 0
    let dmaSum = 0
    const result: Dma[] = []
    dataList.forEach((kLineData, i) => {
      const dma: Dma = {}
      const close = kLineData.close
      closeSum1 += close
      closeSum2 += close
      let ma1 = 0
      let ma2 = 0
      if (i >= params[0] - 1) {
        ma1 = closeSum1 / params[0]
        closeSum1 -= dataList[i - (params[0] - 1)].close
      }
      if (i >= params[1] - 1) {
        ma2 = closeSum2 / params[1]
        closeSum2 -= dataList[i - (params[1] - 1)].close
      }

      if (i >= maxPeriod - 1) {
        const dif = ma1 - ma2
        dma.dma = dif
        dmaSum += dif
        if (i >= maxPeriod + params[2] - 2) {
          dma.ama = dmaSum / params[2]
          dmaSum -= (result[i - (params[2] - 1)].dma ?? 0)
        }
      }
      result.push(dma)
    })
    return result
  }
}

export default differentOfMovingAverage
