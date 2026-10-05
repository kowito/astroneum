// ---------------------------------------------------------------------------
// Indicator catalogue — organised by category for the demo picker
// ---------------------------------------------------------------------------
export interface IndicatorCatalogueEntry {
  name: string
  shortName: string
  category: string
  description: string
  defaultParams?: number[]
}

export const INDICATOR_CATALOGUE: IndicatorCatalogueEntry[] = [
  // Moving Averages
  { name: 'SMA', shortName: 'SMA', category: 'Moving Averages', description: 'Simple Moving Average', defaultParams: [12, 2] },
  { name: 'EMA', shortName: 'EMA', category: 'Moving Averages', description: 'Exponential Moving Average', defaultParams: [6, 12, 20] },
  { name: 'DEMA', shortName: 'DEMA', category: 'Moving Averages', description: 'Double Exponential Moving Average', defaultParams: [20] },
  { name: 'TEMA', shortName: 'TEMA', category: 'Moving Averages', description: 'Triple Exponential Moving Average', defaultParams: [20] },
  { name: 'WMA', shortName: 'WMA', category: 'Moving Averages', description: 'Weighted Moving Average', defaultParams: [20] },
  { name: 'VWMA', shortName: 'VWMA', category: 'Moving Averages', description: 'Volume Weighted Moving Average', defaultParams: [20] },
  { name: 'AMA', shortName: 'AMA', category: 'Moving Averages', description: 'Adaptive Moving Average (KAMA)', defaultParams: [10] },
  { name: 'HMA', shortName: 'HMA', category: 'Moving Averages', description: 'Hull Moving Average', defaultParams: [20] },
  // Trend
  { name: 'MACD', shortName: 'MACD', category: 'Trend', description: 'Moving Average Convergence Divergence', defaultParams: [12, 26, 9] },
  { name: 'DMI', shortName: 'DMI', category: 'Trend', description: 'Directional Movement Index', defaultParams: [14, 6] },
  { name: 'ADX', shortName: 'ADX', category: 'Trend', description: 'Average Directional Index (standalone)', defaultParams: [14] },
  { name: 'SAR', shortName: 'SAR', category: 'Trend', description: 'Parabolic Stop and Reverse', defaultParams: [2, 2, 20] },
  { name: 'TRIX', shortName: 'TRIX', category: 'Trend', description: 'Triple Exponentially Smoothed Average', defaultParams: [12, 5] },
  { name: 'Ichimoku', shortName: 'Ichimoku', category: 'Trend', description: 'Ichimoku Cloud', defaultParams: [9, 26, 52] },
  { name: 'KC', shortName: 'KC', category: 'Trend', description: 'Keltner Channels', defaultParams: [20, 1.5] },
  // Momentum
  { name: 'RSI', shortName: 'RSI', category: 'Momentum', description: 'Relative Strength Index', defaultParams: [6, 12, 24] },
  { name: 'KDJ', shortName: 'KDJ', category: 'Momentum', description: 'Stochastic Oscillator', defaultParams: [9, 3, 3] },
  { name: 'CCI', shortName: 'CCI', category: 'Momentum', description: 'Commodity Channel Index', defaultParams: [13] },
  { name: 'MTM', shortName: 'MTM', category: 'Momentum', description: 'Momentum', defaultParams: [12] },
  { name: 'ROC', shortName: 'ROC', category: 'Momentum', description: 'Rate of Change', defaultParams: [12] },
  { name: '%R', shortName: '%R', category: 'Momentum', description: 'Williams %R', defaultParams: [14] },
  { name: 'AO', shortName: 'AO', category: 'Momentum', description: 'Awesome Oscillator' },
  // Volatility
  { name: 'BOLL', shortName: 'BOLL', category: 'Volatility', description: 'Bollinger Bands', defaultParams: [20, 2] },
  { name: 'ATR', shortName: 'ATR', category: 'Volatility', description: 'Average True Range', defaultParams: [14] },
  { name: 'HV', shortName: 'HV', category: 'Volatility', description: 'Historical Volatility (annualized)', defaultParams: [20] },
  { name: 'DC', shortName: 'DC', category: 'Volatility', description: 'Donchian Channels', defaultParams: [20] },
  { name: 'STDDEV', shortName: 'STDDEV', category: 'Volatility', description: 'Standard Deviation', defaultParams: [20] },
  // Volume
  { name: 'VOL', shortName: 'VOL', category: 'Volume', description: 'Volume', defaultParams: [7, 25, 99] },
  { name: 'OBV', shortName: 'OBV', category: 'Volume', description: 'On Balance Volume', defaultParams: [30] },
  { name: 'PVT', shortName: 'PVT', category: 'Volume', description: 'Price and Volume Trend' },
  { name: 'CMF', shortName: 'CMF', category: 'Volume', description: 'Chaikin Money Flow', defaultParams: [20] },
  { name: 'MFI', shortName: 'MFI', category: 'Volume', description: 'Money Flow Index', defaultParams: [14] },
  { name: 'A/D', shortName: 'A/D', category: 'Volume', description: 'Accumulation / Distribution' },
  { name: 'VROC', shortName: 'VROC', category: 'Volume', description: 'Volume Rate of Change', defaultParams: [14] },
  { name: 'VR', shortName: 'VR', category: 'Volume', description: 'Volume Ratio', defaultParams: [24] },
  // Oscillators
  { name: 'BRAR', shortName: 'BRAR', category: 'Oscillators', description: 'BRAR Emotional Indicator', defaultParams: [26] },
  { name: 'BBI', shortName: 'BBI', category: 'Oscillators', description: 'Bull and Bear Index', defaultParams: [3, 6, 12, 24] },
  { name: 'PSY', shortName: 'PSY', category: 'Oscillators', description: 'Psychological Line', defaultParams: [12, 6] },
  { name: 'BIAS', shortName: 'BIAS', category: 'Oscillators', description: 'Bias Indicator', defaultParams: [6, 12, 24] },
  { name: 'EMV', shortName: 'EMV', category: 'Oscillators', description: 'Ease of Movement Value', defaultParams: [9, 14] },
  { name: 'DMA', shortName: 'DMA', category: 'Oscillators', description: 'Difference of Moving Average', defaultParams: [5, 10, 20, 60] },
  { name: 'CR', shortName: 'CR', category: 'Oscillators', description: 'Current Ratio', defaultParams: [26] },
  // Market Profile
  { name: 'VWAP', shortName: 'VWAP', category: 'Market Profile', description: 'Volume Weighted Average Price' },
  { name: 'PP', shortName: 'PP', category: 'Market Profile', description: 'Pivot Points (Classic)' },
  // Advanced
  { name: 'SuperTrend', shortName: 'SuperTrend', category: 'Advanced', description: 'SuperTrend', defaultParams: [10, 3] },
  { name: 'ZZ', shortName: 'ZZ', category: 'Advanced', description: 'ZigZag', defaultParams: [5] },
  // Correlation
  { name: 'CORR', shortName: 'CORR', category: 'Statistical', description: 'Correlation Coefficient', defaultParams: [20] },
  { name: 'LinReg', shortName: 'LinReg', category: 'Statistical', description: 'Linear Regression Line', defaultParams: [20] },
]

// Group by category for the UI
export const CATEGORIES = Array.from(
  new Set(INDICATOR_CATALOGUE.map(e => e.category))
).map(category => ({
  category,
  items: INDICATOR_CATALOGUE.filter(e => e.category === category),
}))

// Which indicators are plotted on the main price pane (overlay)
export const OVERLAY_INDICATORS = new Set([
  'SMA', 'EMA', 'DEMA', 'TEMA', 'WMA', 'VWMA', 'AMA', 'HMA',
  'BOLL', 'DC', 'KC', 'SAR', 'Ichimoku', 'SuperTrend', 'VWAP',
  'PP', 'ZZ', 'LinReg', 'BBI',
])
