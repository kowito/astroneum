import type Nullable from '../common/Nullable'
import type Bounding from '../common/Bounding'
import { isFunction, isNumber, isString } from '../common/utils/typeChecks'

import AxisImp, { type AxisTemplate, type Axis, type AxisRange, type AxisTick } from './Axis'

import type DrawPane from '../pane/DrawPane'
import { calcTextWidth } from '../common/utils/canvas'
import { PeriodTypeXAxisFormat } from '../common/Period'

const NICE_TIME_INTERVALS_MS = [
  1_000, 2_000, 5_000, 10_000, 15_000, 30_000,
  60_000, 2 * 60_000, 5 * 60_000, 10 * 60_000, 15 * 60_000, 30 * 60_000,
  3_600_000, 2 * 3_600_000, 4 * 3_600_000, 6 * 3_600_000, 12 * 3_600_000,
  86_400_000
]

function timespanToMs (timespan: string, multiplier: number): number {
  switch (timespan) {
    case 'second': return multiplier * 1_000
    case 'minute': return multiplier * 60_000
    case 'hour':   return multiplier * 3_600_000
    default:       return multiplier * 86_400_000
  }
}

function getNiceTimeIntervalMs (minMs: number): number {
  for (const iv of NICE_TIME_INTERVALS_MS) {
    if (iv >= minMs) return iv
  }
  return 86_400_000
}

export type XAxisTemplate = Pick<AxisTemplate, 'name' | 'scrollZoomEnabled' | 'createTicks'>

export interface XAxis extends Axis, Required<XAxisTemplate> {
  convertTimestampFromPixel: (pixel: number) => Nullable<number>
  convertTimestampToPixel: (timestamp: number) => number
}

export type XAxisConstructor = new (parent: DrawPane) => XAxis

export default abstract class XAxisImp extends AxisImp implements XAxis {
  constructor (parent: DrawPane, xAxis: XAxisTemplate) {
    super(parent)
    this.override(xAxis)
  }

  override (xAxis: XAxisTemplate): void {
    const {
      name,
      scrollZoomEnabled,
      createTicks
    } = xAxis
    if (!isString(this.name)) {
      this.name = name
    }
    this.scrollZoomEnabled = scrollZoomEnabled ?? this.scrollZoomEnabled
    this.createTicks = createTicks ?? this.createTicks
  }

  protected override createRangeImp (): AxisRange {
    const chartStore = this.getParent().getChart().getChartStore()
    const visibleDataRange = chartStore.getVisibleRange()
    const { realFrom, realTo } = visibleDataRange
    const af = realFrom
    const at = realTo
    const diff = realTo - realFrom + 1
    const range = {
      from: af,
      to: at,
      range: diff,
      realFrom: af,
      realTo: at,
      realRange: diff,
      displayFrom: af,
      displayTo: at,
      displayRange: diff
    }
    return range
  }

  protected override createTicksImp (): AxisTick[] {
    const { realFrom, realTo, from } = this.getRange()
    const chartStore = this.getParent().getChart().getChartStore()
    const formatDate = chartStore.getInnerFormatter().formatDate
    const period = chartStore.getPeriod()
    const ticks: AxisTick[] = []

    const barSpace = chartStore.getBarSpace().bar
    const textStyles = chartStore.getStyles().xAxis.tickText
    const tickTextWidth = Math.max(calcTextWidth('YYYY-MM-DD HH:mm:ss', textStyles.size, textStyles.weight, textStyles.family), this.getBounding().width / 8)
    let tickBetweenBarCount = Math.ceil(tickTextWidth / barSpace)
    if (tickBetweenBarCount % 2 !== 0) {
      tickBetweenBarCount += 1
    }

    const timespan = period?.timespan ?? 'day'
    const multiplier = period?.multiplier ?? 1

    if (timespan === 'second' || timespan === 'minute' || timespan === 'hour') {
      // Snap ticks to a nice time boundary (e.g. every 5min, 10min …)
      const msPerBar = timespanToMs(timespan, multiplier)
      const minTickIntervalMs = tickBetweenBarCount * msPerBar
      const niceIntervalMs = getNiceTimeIntervalMs(minTickIntervalMs)

      let lastCoord = -Infinity
      for (let i = Math.max(0, Math.floor(realFrom)); i < realTo; i++) {
        if (i < from) continue
        const timestamp = chartStore.dataIndexToTimestamp(i)
        if (!isNumber(timestamp)) continue
        if (timestamp % niceIntervalMs !== 0) continue
        const coord = this.convertToPixel(i)
        // Ensure labels don't crowd (min tickTextWidth gap)
        if (coord - lastCoord < tickTextWidth) continue
        lastCoord = coord
        ticks.push({
          coord,
          value: timestamp,
          text: formatDate(timestamp, PeriodTypeXAxisFormat[timespan], 'xAxis')
        })
      }
    } else {
      const startDataIndex = Math.max(0, Math.floor(realFrom / tickBetweenBarCount) * tickBetweenBarCount)
      for (let i = startDataIndex; i < realTo; i += tickBetweenBarCount) {
        if (i >= from) {
          const timestamp = chartStore.dataIndexToTimestamp(i)
          if (isNumber(timestamp)) {
            ticks.push({
              coord: this.convertToPixel(i),
              value: timestamp,
              text: formatDate(timestamp, PeriodTypeXAxisFormat[timespan], 'xAxis')
            })
          }
        }
      }
    }

    if (isFunction(this.createTicks)) {
      return this.createTicks({
        range: this.getRange(),
        bounding: this.getBounding(),
        defaultTicks: ticks
      })
    }
    return ticks
  }

  override getAutoSize (): number {
    const styles = this.getParent().getChart().getStyles()
    const xAxisStyles = styles.xAxis
    const height = xAxisStyles.size
    if (height !== 'auto') {
      return height
    }
    const crosshairStyles = styles.crosshair
    let xAxisHeight = 0
    if (xAxisStyles.show) {
      if (xAxisStyles.axisLine.show) {
        xAxisHeight += xAxisStyles.axisLine.size
      }
      if (xAxisStyles.tickLine.show) {
        xAxisHeight += xAxisStyles.tickLine.length
      }
      if (xAxisStyles.tickText.show) {
        xAxisHeight += (xAxisStyles.tickText.marginStart + xAxisStyles.tickText.marginEnd + xAxisStyles.tickText.size)
      }
    }
    let crosshairVerticalTextHeight = 0
    if (
      crosshairStyles.show &&
      crosshairStyles.vertical.show &&
      crosshairStyles.vertical.text.show
    ) {
      crosshairVerticalTextHeight += (
        crosshairStyles.vertical.text.paddingTop +
        crosshairStyles.vertical.text.paddingBottom +
        crosshairStyles.vertical.text.borderSize * 2 +
        crosshairStyles.vertical.text.size
      )
    }
    return Math.max(xAxisHeight, crosshairVerticalTextHeight)
  }

  protected override getBounding (): Bounding {
    return this.getParent().getMainWidget().getBounding()
  }

  convertTimestampFromPixel (pixel: number): Nullable<number> {
    const chartStore = this.getParent().getChart().getChartStore()
    const dataIndex = chartStore.coordinateToDataIndex(pixel)
    return chartStore.dataIndexToTimestamp(dataIndex)
  }

  convertTimestampToPixel (timestamp: number): number {
    const chartStore = this.getParent().getChart().getChartStore()
    const dataIndex = chartStore.timestampToDataIndex(timestamp)
    return chartStore.dataIndexToCoordinate(dataIndex)
  }

  convertFromPixel (pixel: number): number {
    return this.getParent().getChart().getChartStore().coordinateToDataIndex(pixel)
  }

  convertToPixel (value: number): number {
    return this.getParent().getChart().getChartStore().dataIndexToCoordinate(value)
  }

  static extend (template: XAxisTemplate): XAxisConstructor {
    class Custom extends XAxisImp {
      constructor (parent: DrawPane) {
        super(parent, template)
      }
    }
    return Custom
  }
}
