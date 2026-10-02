/** Built-in candle renderings; set through `styles.candle.type`. */
export type CandleStyle = 'candle_solid' | 'candle_up_stroke' | 'ohlc' | 'line' | 'area'

/** What a chart type is. Plain data, so server-rendered pages can list the types too. */
export interface ChartTypeInfo {
  id: string
  label: string
  /** One line shown under the picker and on the gallery cards. */
  description: string
  style: CandleStyle
  /** Time is not on the x-axis: bars are bricks/ranges/segments with synthetic times. */
  timeless?: boolean
}

export const CHART_TYPE_INFO: ChartTypeInfo[] = [
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
  },
  {
    id: 'renko',
    label: 'Renko',
    description: 'Fixed-size bricks that only move when price moves one brick. Time is ignored.',
    style: 'candle_solid',
    timeless: true,
  },
  {
    id: 'range',
    label: 'Range bars',
    description: 'Each bar spans a fixed price range, however long that takes. Time is ignored.',
    style: 'candle_solid',
    timeless: true,
  },
]

export const DEFAULT_CHART_TYPE = CHART_TYPE_INFO[0].id
