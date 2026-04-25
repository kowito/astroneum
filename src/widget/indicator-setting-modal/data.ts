import type { IndicatorConfigMap } from './types'

const indicatorConfigMap: IndicatorConfigMap = {
  AO: [
    { paramNameKey: 'params_1', precision: 0, min: 1, default: 5 },
    { paramNameKey: 'params_2', precision: 0, min: 1, default: 34 }
  ],
  BIAS: [
    { paramNameKey: 'line_1', precision: 0, min: 1, styleKey: 'lines[0].color' },
    { paramNameKey: 'line_2', precision: 0, min: 1, styleKey: 'lines[1].color' },
    { paramNameKey: 'line_3', precision: 0, min: 1, styleKey: 'lines[2].color' },
    { paramNameKey: 'line_4', precision: 0, min: 1, styleKey: 'lines[3].color' },
    { paramNameKey: 'line_5', precision: 0, min: 1, styleKey: 'lines[4].color' }
  ],
  BOLL: [
    { paramNameKey: 'period', precision: 0, min: 1, default: 20 },
    { paramNameKey: 'standard_deviation', precision: 2, min: 1, default: 2 }
  ],
  BRAR: [
    { paramNameKey: 'period', precision: 0, min: 1, default: 26 }
  ],
  BBI: [
    { paramNameKey: 'params_1', precision: 0, min: 1, default: 3 },
    { paramNameKey: 'params_2', precision: 0, min: 1, default: 6 },
    { paramNameKey: 'params_3', precision: 0, min: 1, default: 12 },
    { paramNameKey: 'params_4', precision: 0, min: 1, default: 24 }
  ],
  CCI: [
    { paramNameKey: 'params_1', precision: 0, min: 1, default: 20 }
  ],
  CR: [
    { paramNameKey: 'params_1', precision: 0, min: 1, default: 26 },
    { paramNameKey: 'params_2', precision: 0, min: 1, default: 10 },
    { paramNameKey: 'params_3', precision: 0, min: 1, default: 20 },
    { paramNameKey: 'params_4', precision: 0, min: 1, default: 40 },
    { paramNameKey: 'params_5', precision: 0, min: 1, default: 60 }
  ],
  DMA: [
    { paramNameKey: 'params_1', precision: 0, min: 1, default: 10 },
    { paramNameKey: 'params_2', precision: 0, min: 1, default: 50 },
    { paramNameKey: 'params_3', precision: 0, min: 1, default: 10 }
  ],
  DMI: [
    { paramNameKey: 'params_1', precision: 0, min: 1, default: 14 },
    { paramNameKey: 'params_2', precision: 0, min: 1, default: 6 }
  ],
  EMV: [
    { paramNameKey: 'params_1', precision: 0, min: 1, default: 14 },
    { paramNameKey: 'params_2', precision: 0, min: 1, default: 9 }
  ],
  EMA: [
    { paramNameKey: 'line_1', precision: 0, min: 1, styleKey: 'lines[0].color' },
    { paramNameKey: 'line_2', precision: 0, min: 1, styleKey: 'lines[1].color' },
    { paramNameKey: 'line_3', precision: 0, min: 1, styleKey: 'lines[2].color' },
    { paramNameKey: 'line_4', precision: 0, min: 1, styleKey: 'lines[3].color' },
    { paramNameKey: 'line_5', precision: 0, min: 1, styleKey: 'lines[4].color' }
  ],
  MTM: [
    { paramNameKey: 'params_1', precision: 0, min: 1, default: 12 },
    { paramNameKey: 'params_2', precision: 0, min: 1, default: 6 }
  ],
  MA: [
    { paramNameKey: 'line_1', precision: 0, min: 1, styleKey: 'lines[0].color' },
    { paramNameKey: 'line_2', precision: 0, min: 1, styleKey: 'lines[1].color' },
    { paramNameKey: 'line_3', precision: 0, min: 1, styleKey: 'lines[2].color' },
    { paramNameKey: 'line_4', precision: 0, min: 1, styleKey: 'lines[3].color' },
    { paramNameKey: 'line_5', precision: 0, min: 1, styleKey: 'lines[4].color' },
  ],
  MACD: [
    { paramNameKey: 'params_1', precision: 0, min: 1, default: 12 },
    { paramNameKey: 'params_2', precision: 0, min: 1, default: 26 },
    { paramNameKey: 'params_3', precision: 0, min: 1, default: 9 }
  ],
  OBV: [
    { paramNameKey: 'params_1', precision: 0, min: 1, default: 30 }
  ],
  PVT: [],
  PSY: [
    { paramNameKey: 'params_1', precision: 0, min: 1, default: 12 },
    { paramNameKey: 'params_2', precision: 0, min: 1, default: 6 }
  ],
  ROC: [
    { paramNameKey: 'params_1', precision: 0, min: 1, default: 12 },
    { paramNameKey: 'params_2', precision: 0, min: 1, default: 6 }
  ],
  RSI: [
    { paramNameKey: 'line_1', precision: 0, min: 1, styleKey: 'lines[0].color' },
    { paramNameKey: 'line_2', precision: 0, min: 1, styleKey: 'lines[1].color' },
    { paramNameKey: 'line_3', precision: 0, min: 1, styleKey: 'lines[2].color' },
    { paramNameKey: 'line_4', precision: 0, min: 1, styleKey: 'lines[3].color' },
    { paramNameKey: 'line_5', precision: 0, min: 1, styleKey: 'lines[4].color' }
  ],
  SMA: [
    { paramNameKey: 'params_1', precision: 0, min: 1, default: 12 },
    { paramNameKey: 'params_2', precision: 0, min: 1, default: 2 }
  ],
  KDJ: [
    { paramNameKey: 'params_1', precision: 0, min: 1, default: 9 },
    { paramNameKey: 'params_2', precision: 0, min: 1, default: 3 },
    { paramNameKey: 'params_3', precision: 0, min: 1, default: 3 }
  ],
  SAR: [
    { paramNameKey: 'params_1', precision: 0, min: 1, default: 2 },
    { paramNameKey: 'params_2', precision: 0, min: 1, default: 2 },
    { paramNameKey: 'params_3', precision: 0, min: 1, default: 20 }
  ],
  TRIX: [
    { paramNameKey: 'params_1', precision: 0, min: 1, default: 12 },
    { paramNameKey: 'params_2', precision: 0, min: 1, default: 9 }
  ],
  VOL: [
    { paramNameKey: 'line_1', precision: 0, min: 1, styleKey: 'lines[0].color' },
    { paramNameKey: 'line_2', precision: 0, min: 1, styleKey: 'lines[1].color' },
    { paramNameKey: 'line_3', precision: 0, min: 1, styleKey: 'lines[2].color' },
    { paramNameKey: 'line_4', precision: 0, min: 1, styleKey: 'lines[3].color' },
    { paramNameKey: 'line_5', precision: 0, min: 1, styleKey: 'lines[4].color' },
  ],
  VR: [
    { paramNameKey: 'params_1', precision: 0, min: 1, default: 26 },
    { paramNameKey: 'params_2', precision: 0, min: 1, default: 6 }
  ],
  WR: [
    { paramNameKey: 'line_1', precision: 0, min: 1, styleKey: 'lines[0].color' },
    { paramNameKey: 'line_2', precision: 0, min: 1, styleKey: 'lines[1].color' },
    { paramNameKey: 'line_3', precision: 0, min: 1, styleKey: 'lines[2].color' },
    { paramNameKey: 'line_4', precision: 0, min: 1, styleKey: 'lines[3].color' },
    { paramNameKey: 'line_5', precision: 0, min: 1, styleKey: 'lines[4].color' },
  ]
}

export default indicatorConfigMap
