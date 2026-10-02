/**
 * createTransformedDatafeed — turn any time-based datafeed into one that serves
 * a *derived* series: Heikin-Ashi, Renko, Range bars, Kagi, or your own
 * `CandleData[] -> CandleData[]` function — historical bars and live ticks.
 *
 *   const renko = createTransformedDatafeed(datafeed, history => {
 *     const brick = 2 * averageRange(history)          // chosen once, from the loaded history
 *     return bars => generateRenko(bars, brick)
 *   })
 *   <AstroneumChart datafeed={renko} ... />
 *
 * The first history request of a series builds the derived series from the
 * loaded window (the factory runs once, so parameters such as a brick size stay
 * fixed). Each live tick updates the underlying bars, re-derives the series and
 * hands the chart only what changed: the newest bar replaced, or new bars
 * appended. Older history can't be derived from a window, so requests for bars
 * before the loaded window return nothing.
 *
 * Derived series may use synthetic timestamps (Renko, Range, Kagi do): they only
 * need to increase. The chart's time axis then shows those synthetic times.
 */

import type { CandleData, Datafeed, DatafeedSubscribeCallback, Period, SymbolInfo } from '@/types'

/** Derive a series from time-based bars (ascending, newest last). */
export type BarTransform = (bars: CandleData[]) => CandleData[]

/**
 * Called once per loaded series with the initial raw bars; returns the transform
 * used for that series. Pick parameters here so they stay fixed during live updates.
 */
export type BarTransformFactory = (history: CandleData[]) => BarTransform

interface Series {
  /** Underlying time-based bars, ascending. */
  raw: CandleData[]
  transform: BarTransform
  /** What the chart currently shows. */
  output: CandleData[]
  callback: DatafeedSubscribeCallback | null
}

function seriesKey (symbol: SymbolInfo, period: Period): string {
  return `${symbol.exchange ?? ''}:${symbol.ticker}|${period.multiplier}${period.timespan}`
}

function sameBar (a: CandleData, b: CandleData): boolean {
  return a.timestamp === b.timestamp && a.open === b.open && a.high === b.high &&
    a.low === b.low && a.close === b.close && a.volume === b.volume
}

export function createTransformedDatafeed (base: Datafeed, factory: BarTransformFactory): Datafeed {
  const series = new Map<string, Series>()

  const onTick = (key: string, bar: CandleData): void => {
    const s = series.get(key)
    if (s === undefined) return
    const last = s.raw[s.raw.length - 1]
    if (last !== undefined && bar.timestamp < last.timestamp) return // out-of-order tick
    if (last !== undefined && bar.timestamp === last.timestamp) s.raw[s.raw.length - 1] = bar
    else s.raw.push(bar)

    const previous = s.output
    const next = s.transform(s.raw)
    s.output = next
    // The chart can replace its newest bar or append, but not rewrite older bars,
    // so start at the first difference or the previous newest bar, whichever is later.
    let from = 0
    while (from < previous.length && from < next.length && sameBar(previous[from], next[from])) from++
    from = Math.max(from, previous.length - 1, 0)
    for (let i = from; i < next.length; i++) {
      if (i < previous.length && sameBar(previous[i], next[i])) continue
      s.callback?.(next[i])
    }
  }

  return {
    searchSymbols: async (search) => await base.searchSymbols(search),

    async getHistoryData (symbol, period, from, to) {
      const key = seriesKey(symbol, period)
      const existing = series.get(key)
      // The chart asks for older history after the first load. A derived series
      // can't be extended backwards, so say there is nothing more.
      if (existing !== undefined && existing.raw.length > 0 && to <= existing.raw[0].timestamp) return []

      const history = (await base.getHistoryData(symbol, period, from, to))
        .slice()
        .sort((a, b) => a.timestamp - b.timestamp)
      const transform = factory(history)
      const output = transform(history)
      series.set(key, { raw: history, transform, output, callback: existing?.callback ?? null })
      return output.slice()
    },

    subscribe (symbol, period, callback) {
      const key = seriesKey(symbol, period)
      const s = series.get(key)
      if (s !== undefined) s.callback = callback
      base.subscribe(symbol, period, bar => { onTick(key, bar) })
    },

    unsubscribe (symbol, period) {
      series.delete(seriesKey(symbol, period))
      base.unsubscribe(symbol, period)
    }
  }
}
