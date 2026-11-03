import type DeepPartial from '../../common/DeepPartial'
import type { Styles } from '../../common/Styles'

// Light theme: white chart, #E0E3EB dividers, #131722 text.
// Keep the keys in step with the other theme: switching themes merges one
// over the other, so a key set only here would survive the switch.
const light: DeepPartial<Styles> = {
  grid: {
    horizontal: { color: '#F0F3FA' },
    vertical: { color: '#F0F3FA' }
  },
  candle: {
    priceMark: {
      high: { color: '#131722' },
      low: { color: '#131722' }
    },
    tooltip: {
      rect: {
        color: '#FFFFFF',
        borderColor: '#E0E3EB'
      },
      title: { color: '#131722' },
      legend: { color: '#131722' }
    }
  },
  indicator: {
    tooltip: {
      title: { color: '#131722' },
      legend: { color: '#131722' }
    }
  },
  xAxis: {
    axisLine: { color: '#E0E3EB' },
    tickText: { color: '#131722' },
    tickLine: { color: '#E0E3EB' }
  },
  yAxis: {
    axisLine: { color: '#E0E3EB' },
    tickText: { color: '#131722' },
    tickLine: { color: '#E0E3EB' }
  },
  separator: {
    color: '#E0E3EB'
  },
  crosshair: {
    horizontal: {
      line: { color: '#9598A1' },
      text: {
        color: '#FFFFFF',
        borderColor: '#131722',
        backgroundColor: '#131722'
      }
    },
    vertical: {
      line: { color: '#9598A1' },
      text: {
        color: '#FFFFFF',
        borderColor: '#131722',
        backgroundColor: '#131722'
      }
    }
  }
}

export default light
