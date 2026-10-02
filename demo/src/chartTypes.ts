import {
  generateRangeBars,
  generateRenko,
  heikinAshi,
  type CandleData,
} from 'astroneum'

/** Built-in candle renderings; set through `styles.candle.type`. */
export type CandleStyle = 'candle_solid' | 'candle_up_stroke' | 'ohlc' | 'line' | 'area'

export interface ChartTypeDef {
  id: string
  label: string
  /** One line shown under the picker. */
  description: string
  style: CandleStyle
  /**
   * Derived series: receives the loaded history once (to choose fixed
   * parameters) and returns the function that rebuilds the series from the
   * time-based bars. Absent for types the chart draws itself.
   */
  derive?: (history: CandleData[]) => (bars: CandleData[]) => CandleData[]
  /** Time is not on the x-axis: bars are bricks/ranges/segments with synthetic times. */
  timeless?: boolean
}

/** Mean high-low range of the most recent bars: a scale for brick and range sizes. */
function averageRange(bars: CandleData[], count = 100): number {
  const recent = bars.slice(-count)
  if (recent.length === 0) return 1
  const mean = recent.reduce((sum, bar) => sum + (bar.high - bar.low), 0) / recent.length
  return mean > 0 ? mean : Math.max(Math.abs(recent[recent.length - 1].close) * 0.001, 1e-8)
}

/** Two significant digits, so sizes read like 40 or 0.012 rather than 37.3918. */
function niceSize(value: number): number {
  return Number(value.toPrecision(2))
}

export const CHART_TYPES: ChartTypeDef[] = [
  {
    id: 'candles',
    label: 'Candlestick',
    description: 'Open, high, low and close for each period, filled by direction.',
    style: 'candle_solid',
  },
  {
    id: 'hollow',
    label: 'Hollow candles',
    description: 'Rising candles are hollow, falling candles are filled.',
    style: 'candle_up_stroke',
  },
  {
    id: 'ohlc',
    label: 'OHLC bars',
    description: 'A vertical high-low bar with ticks for the open (left) and close (right).',
    style: 'ohlc',
  },
  {
    id: 'line',
    label: 'Line',
    description: 'The closing price as a single line. The pulsing dot is the live price.',
    style: 'line',
  },
  {
    id: 'area',
    label: 'Area',
    description: 'The closing price as a line with the area underneath filled.',
    style: 'area',
  },
  {
    id: 'heikin-ashi',
    label: 'Heikin-Ashi',
    description: 'Averaged candles that smooth noise and make trends easier to read.',
    style: 'candle_solid',
    derive: () => heikinAshi,
  },
  {
    id: 'renko',
    label: 'Renko',
    description: 'Fixed-size bricks that only move when price moves one brick. Time is ignored.',
    style: 'candle_solid',
    timeless: true,
    derive: (history) => {
      const brick = niceSize(averageRange(history))
      return (bars) => generateRenko(bars, brick)
    },
  },
  {
    id: 'range',
    label: 'Range bars',
    description: 'Each bar spans a fixed price range, however long that takes. Time is ignored.',
    style: 'candle_solid',
    timeless: true,
    derive: (history) => {
      const range = niceSize(averageRange(history) * 3)
      return (bars) => generateRangeBars(bars, range)
    },
  },
]

export const DEFAULT_CHART_TYPE = CHART_TYPES[0].id

export function findChartType(id: string | null | undefined): ChartTypeDef {
  return CHART_TYPES.find(type => type.id === id) ?? CHART_TYPES[0]
}
