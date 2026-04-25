import { formatPrecision } from '../../common/utils/format'
import { isValid } from '../../common/utils/typeChecks'
import type { AxisTemplate } from '../../component/Axis'

const percentage: AxisTemplate = {
  name: 'percentage',
  minSpan: () => Math.pow(10, -2),
  displayValueToText: value => `${formatPrecision(value, 2)}%`,
  valueToRealValue: (value, { range }) => (value - range.from) / range.range * range.realRange + range.realFrom,
  realValueToValue: (value, { range }) => (value - range.realFrom) / range.realRange * range.range + range.from,
  createRange: ({ chart, defaultRange }) => {
    const candleDataList = chart.getDataList()
    const visibleRange = chart.getVisibleRange()
    const candleData = candleDataList[visibleRange.from]
    if (isValid(candleData)) {
      const { from, to, range } = defaultRange
      const realFrom = (defaultRange.from - candleData.close) / candleData.close * 100
      const realTo = (defaultRange.to - candleData.close) / candleData.close * 100
      const realRange = realTo - realFrom
      return {
        from,
        to,
        range,
        realFrom,
        realTo,
        realRange,
        displayFrom: realFrom,
        displayTo: realTo,
        displayRange: realRange
      }
    }
    return defaultRange
  }
}

export default percentage
