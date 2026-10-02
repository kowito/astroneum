import {
  generateRangeBars,
  generateRenko,
  heikinAshi,
  type CandleData,
} from 'astroneum'

import { CHART_TYPE_INFO, DEFAULT_CHART_TYPE, type ChartTypeInfo } from './chartTypeInfo'

export { DEFAULT_CHART_TYPE }
export type { CandleStyle } from './chartTypeInfo'

export interface ChartTypeDef extends ChartTypeInfo {
  /**
   * Derived series: receives the loaded history once (to choose fixed
   * parameters) and returns the function that rebuilds the series from the
   * time-based bars. Absent for types the chart draws itself.
   */
  derive?: (history: CandleData[]) => (bars: CandleData[]) => CandleData[]
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

const DERIVE: Record<string, ChartTypeDef['derive']> = {
  'heikin-ashi': () => heikinAshi,
  renko: (history) => {
    const brick = niceSize(averageRange(history))
    return (bars) => generateRenko(bars, brick)
  },
  range: (history) => {
    const range = niceSize(averageRange(history) * 3)
    return (bars) => generateRangeBars(bars, range)
  },
}

export const CHART_TYPES: ChartTypeDef[] = CHART_TYPE_INFO.map(info => ({ ...info, derive: DERIVE[info.id] }))

export function findChartType(id: string | null | undefined): ChartTypeDef {
  return CHART_TYPES.find(type => type.id === id) ?? CHART_TYPES[0]
}
