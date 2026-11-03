import type DeepPartial from '../../common/DeepPartial'
import type { Styles } from '../../common/Styles'

// Dark theme: #131722 chart on #1E222D popovers, #2A2E39 dividers.
// Keep the keys in step with the other theme: switching themes merges one
// over the other, so a key set only here would survive the switch.
const dark: DeepPartial<Styles> = {
  grid: {
    horizontal: { color: 'rgba(42, 46, 57, 0.6)' },
    vertical: { color: 'rgba(42, 46, 57, 0.6)' }
  },
  candle: {
    priceMark: {
      high: { color: '#B2B5BE' },
      low: { color: '#B2B5BE' }
    },
    tooltip: {
      rect: {
        color: '#1E222D',
        borderColor: '#2A2E39'
      },
      title: { color: '#D1D4DC' },
      legend: { color: '#D1D4DC' }
    }
  },
  indicator: {
    tooltip: {
      title: { color: '#B2B5BE' },
      legend: { color: '#B2B5BE' }
    }
  },
  xAxis: {
    axisLine: { color: '#2A2E39' },
    tickText: { color: '#B2B5BE' },
    tickLine: { color: '#2A2E39' }
  },
  yAxis: {
    axisLine: { color: '#2A2E39' },
    tickText: { color: '#B2B5BE' },
    tickLine: { color: '#2A2E39' }
  },
  separator: {
    color: '#2A2E39'
  },
  crosshair: {
    horizontal: {
      line: { color: '#758696' },
      text: {
        color: '#D1D4DC',
        borderColor: '#363A45',
        backgroundColor: '#363A45'
      }
    },
    vertical: {
      line: { color: '#758696' },
      text: {
        color: '#D1D4DC',
        borderColor: '#363A45',
        backgroundColor: '#363A45'
      }
    }
  }
}

export default dark
