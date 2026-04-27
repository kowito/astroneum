import type DeepPartial from '../../common/DeepPartial'
import type { Styles } from '../../common/Styles'

const dark: DeepPartial<Styles> = {
  grid: {
    horizontal: {
      color: '#292929'
    },
    vertical: {
      color: '#292929'
    }
  },
  candle: {
    priceMark: {
      high: {
        color: '#C9D1D9'
      },
      low: {
        color: '#C9D1D9'
      }
    },
    tooltip: {
      rect: {
        color: 'rgba(10, 10, 10, .6)',
        borderColor: 'rgba(10, 10, 10, .6)'
      },
      title: {
        color: '#929AA5'
      },
      legend: {
        color: '#929AA5'
      }
    }
  },
  indicator: {
    tooltip: {
      title: {
        color: '#929AA5'
      },
      legend: {
        color: '#929AA5'
      }
    }
  },
  xAxis: {
    axisLine: {
      color: '#333333'
    },
    tickText: {
      color: '#929AA5'
    },
    tickLine: {
      color: '#333333'
    }
  },
  yAxis: {
    axisLine: {
      color: '#333333'
    },
    tickText: {
      color: '#929AA5'
    },
    tickLine: {
      color: '#333333'
    }
  },
  separator: {
    color: '#333333'
  },
  crosshair: {
    horizontal: {
      line: {
        color: '#929AA5'
      },
      text: {
        borderColor: '#373a40',
        backgroundColor: '#373a40'
      }
    },
    vertical: {
      line: {
        color: '#929AA5'
      },
      text: {
        borderColor: '#373a40',
        backgroundColor: '#373a40'
      }
    }
  }
}

export default dark
