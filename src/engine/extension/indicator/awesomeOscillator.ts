import { formatValue } from '../../common/utils/format'

import type { IndicatorTemplate } from '../../component/Indicator'

interface Ao {
  ao?: number
}

const awesomeOscillator: IndicatorTemplate<Ao, number> = {
  name: 'AO',
  shortName: 'AO',
  calcParams: [5, 34],
  figures: [{
    key: 'ao',
    title: 'AO: ',
    type: 'bar',
    baseValue: 0,
    styles: ({ data, indicator, defaultStyles }) => {
      const { prev, current } = data
      const prevAo = prev?.ao ?? Number.MIN_SAFE_INTEGER
      const currentAo = current?.ao ?? Number.MIN_SAFE_INTEGER
      let color = ''
      if (currentAo > prevAo) {
        color = formatValue(indicator.styles, 'bars[0].upColor', (defaultStyles!.bars)[0].upColor) as string
      } else {
        color = formatValue(indicator.styles, 'bars[0].downColor', (defaultStyles!.bars)[0].downColor) as string
      }
      const style = currentAo > prevAo ? 'stroke' : 'fill'
      return { color, style, borderColor: color }
    }
  }],
  calc: (dataList, indicator) => {
    const params = indicator.calcParams
    const maxPeriod = Math.max(params[0], params[1])
    let shortPeriodMidpointSum = 0
    let longPeriodMidpointSum = 0
    let shortPeriodAverage = 0
    let longPeriodAverage = 0
    return dataList.map((candleData, dataIndex) => {
      const ao: Ao = {}
      const midpointPrice = (candleData.low + candleData.high) / 2
      shortPeriodMidpointSum += midpointPrice
      longPeriodMidpointSum += midpointPrice
      if (dataIndex >= params[0] - 1) {
        shortPeriodAverage = shortPeriodMidpointSum / params[0]
        const exitingShortPeriodData = dataList[dataIndex - (params[0] - 1)]
        shortPeriodMidpointSum -= ((exitingShortPeriodData.low + exitingShortPeriodData.high) / 2)
      }
      if (dataIndex >= params[1] - 1) {
        longPeriodAverage = longPeriodMidpointSum / params[1]
        const exitingLongPeriodData = dataList[dataIndex - (params[1] - 1)]
        longPeriodMidpointSum -= ((exitingLongPeriodData.low + exitingLongPeriodData.high) / 2)
      }
      if (dataIndex >= maxPeriod - 1) {
        ao.ao = shortPeriodAverage - longPeriodAverage
      }
      return ao
    })
  }
}

export default awesomeOscillator
