/**
 * DrawingSnapper — snap-to-key-levels helper.
 *
 * Computes psychological price levels (round numbers, previous session
 * high/low/open/close) from visible chart data and exposes them as snap
 * candidates.  When activated the helper also creates lightweight
 * horizontal "guide" overlays on the chart so the engine's magnet can
 * snap to them naturally.
 *
 * Usage:
 *   const snapper = new DrawingSnapper(chart)
 *   snapper.enable()   // auto-refreshes guides when chart pans/zooms
 *   snapper.disable()  // removes all guide overlays
 */

import type { Chart, CandleData } from '@/engine'

const GUIDE_GROUP = '__snap_guides__'
const GUIDE_OVERLAY = 'priceLine'

export interface SnapLevel {
  price: number
  label: string
  type: 'round' | 'session_high' | 'session_low' | 'session_open' | 'session_close'
}

function computeRoundLevels (low: number, high: number): number[] {
  const range = high - low
  if (range <= 0) return []

  // Determine step size: target ~8–12 lines in view
  const rawStep = range / 10
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const step = Math.ceil(rawStep / magnitude) * magnitude

  const levels: number[] = []
  const start = Math.ceil(low / step) * step
  for (let price = start; price <= high + step * 0.1; price += step) {
    levels.push(parseFloat(price.toPrecision(10)))
  }
  return levels
}

function sessionExtremes (bars: CandleData[]): Pick<SnapLevel, 'price' | 'label' | 'type'>[] {
  if (bars.length === 0) return []
  const last = bars[bars.length - 1]
  // Use last full day as "session"
  const oneDayMs = 86_400_000
  const sessionStart = last.timestamp - oneDayMs
  const sessionBars = bars.filter(b => b.timestamp >= sessionStart)
  if (sessionBars.length === 0) return []

  const highs = sessionBars.map(b => b.high)
  const lows = sessionBars.map(b => b.low)

  return [
    { price: sessionBars[0].open,        label: 'Prev Open',  type: 'session_open' },
    { price: last.close,                  label: 'Last Close', type: 'session_close' },
    { price: Math.max(...highs),          label: 'Sess High',  type: 'session_high' },
    { price: Math.min(...lows),           label: 'Sess Low',   type: 'session_low' }
  ]
}

export class DrawingSnapper {
  private _chart: Chart
  private _enabled = false
  private _animFrame: number | null = null

  constructor (chart: Chart) {
    this._chart = chart
  }

  get enabled (): boolean { return this._enabled }

  enable (): void {
    if (this._enabled) return
    this._enabled = true
    this._refresh()
  }

  disable (): void {
    if (!this._enabled) return
    this._enabled = false
    this._removeGuides()
    if (this._animFrame !== null) {
      cancelAnimationFrame(this._animFrame)
      this._animFrame = null
    }
  }

  toggle (): void {
    if (this._enabled) { this.disable() } else { this.enable() }
  }

  /**
   * Call this when the chart scrolls/zooms to refresh snap guides.
   * Debounced via rAF.
   */
  refresh (): void {
    if (!this._enabled) return
    if (this._animFrame !== null) cancelAnimationFrame(this._animFrame)
    this._animFrame = requestAnimationFrame(() => {
      this._animFrame = null
      this._refresh()
    })
  }

  private _refresh (): void {
    this._removeGuides()
    const levels = this._computeLevels()
    for (const lvl of levels) {
      try {
        this._chart.createOverlay({
          name: GUIDE_OVERLAY,
          groupId: GUIDE_GROUP,
          lock: true,
          visible: true,
          mode: 'normal',
          points: [{ value: lvl.price }],
          extendData: lvl.label,
          styles: {
            line: {
              color: lvl.type === 'round'
                ? 'rgba(120,120,120,0.25)'
                : 'rgba(41,98,255,0.35)',
              size: 1,
              style: lvl.type === 'round' ? 'dashed' : 'solid',
              dashedValue: [4, 4]
            }
          }
        })
      } catch {
        // overlay creation may fail if chart is disposed
      }
    }
  }

  private _removeGuides (): void {
    try { this._chart.removeOverlay({ groupId: GUIDE_GROUP }) } catch { /* ignore */ }
  }

  private _computeLevels (): SnapLevel[] {
    const data = this._chart.getDataList?.() as CandleData[] | undefined
    if (!data || data.length === 0) return []

    const visible = data.slice(Math.max(0, data.length - 200))
    const highs = visible.map(b => b.high)
    const lows = visible.map(b => b.low)
    const high = Math.max(...highs)
    const low = Math.min(...lows)

    const roundLevels: SnapLevel[] = computeRoundLevels(low, high).map(price => ({
      price,
      label: String(price),
      type: 'round' as const
    }))

    const sessionLevels: SnapLevel[] = sessionExtremes(data)

    return [...roundLevels, ...sessionLevels]
  }
}

export default DrawingSnapper
