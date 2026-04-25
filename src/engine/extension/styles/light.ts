import type DeepPartial from '../../common/DeepPartial'
import type { Styles } from '../../common/Styles'

const light: DeepPartial<Styles> = {
  grid: {
    horizontal: {
      color: '#EDEDED'
    },
    vertical: {
      color: '#EDEDED'
    }
  },
  candle: {
    priceMark: {
      high: {
        color: '#76808F'
      },
      low: {
        color: '#76808F'
      }
    },
    tooltip: {
      rect: {
        color: '#FEFEFE',
        borderColor: '#F2F3F5'
      },
      title: {
        color: '#76808F'
      },
      legend: {
        color: '#76808F'
      }
    }
  },
  indicator: {
    tooltip: {
      title: {
        color: '#76808F'
      },
      legend: {
        color: '#76808F'
      }
    }
  },
  xAxis: {
    axisLine: {
      color: '#DDDDDD'
    },
    tickText: {
      color: '#76808F'
    },
    tickLine: {
      color: '#DDDDDD'
    }
  },
  yAxis: {
    axisLine: {
      color: '#DDDDDD'
    },
    tickText: {
      color: '#76808F'
    },
    tickLine: {
      color: '#DDDDDD'
    }
  },
  separator: {
    color: '#DDDDDD'
  },
  crosshair: {
    horizontal: {
      line: {
        color: '#76808F'
      },
      text: {
        borderColor: '#686D76',
        backgroundColor: '#686D76'
      }
    },
    vertical: {
      line: {
        color: '#76808F'
      },
      text: {
        borderColor: '#686D76',
        backgroundColor: '#686D76'
      }
    }
  }
}

export default light
