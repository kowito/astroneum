// @ts-nocheck

import { formatValue } from '../../common/utils/format'
import { isValid } from '../../common/utils/typeChecks'

import type { IndicatorTemplate, IndicatorFigure } from '../../component/Indicator'

interface Vol {
  open: number
  close: number
  volume?: number
  ma1?: number
  ma2?: number
  ma3?: number
}

function getVolumeFigure (): IndicatorFigure<Vol> {
  return {
    key: 'volume',
    title: 'VOLUME: ',
    type: 'bar',
    baseValue: 0,
    styles: ({ data, indicator, defaultStyles }) => {
      const current = data.current
      let color = formatValue(indicator.styles, 'bars[0].noChangeColor', (defaultStyles!.bars)[0].noChangeColor)
      if (isValid(current)) {
        if (current.close > current.open) {
          color = formatValue(indicator.styles, 'bars[0].upColor', (defaultStyles!.bars)[0].upColor)
        } else if (current.close < current.open) {
          color = formatValue(indicator.styles, 'bars[0].downColor', (defaultStyles!.bars)[0].downColor)
        }
      }
      return { color: color as string }
    }
  }
}

const volume: IndicatorTemplate<Vol, number> = {
  name: 'VOL',
  shortName: 'VOL',
  series: 'volume',
  calcParams: [7, 25, 99],
  shouldFormatBigNumber: true,
  precision: 0,
  minValue: 0,
  figures: [
    { key: 'ma1', title: 'MA5: ', type: 'line' },
    { key: 'ma2', title: 'MA10: ', type: 'line' },
    { key: 'ma3', title: 'MA20: ', type: 'line' },
    getVolumeFigure()
  ],
  regenerateFigures: (params) => {
    const figures: Array<IndicatorFigure<Vol>> = params.map((p, i) => ({ key: `ma${i + 1}`, title: `MA${p}: `, type: 'line' }))
    figures.push(getVolumeFigure())
    return figures
  },
  calc: (dataList, indicator) => {
    const { calcParams: params, figures } = indicator
    const volSums: number[] = []
    return dataList.map((kLineData, i) => {
      const volume = kLineData.volume ?? 0
      const vol: Vol = { volume, open: kLineData.open, close: kLineData.close }
      params.forEach((p, index) => {
        volSums[index] = (volSums[index] ?? 0) + volume
        if (i >= p - 1) {
          vol[figures[index].key] = volSums[index] / p
          volSums[index] -= (dataList[i - (p - 1)].volume ?? 0)
        }
      })
      return vol
    })
  }
}

export default volume
