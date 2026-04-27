// @ts-nocheck

import type Bounding from '../common/Bounding'
import { isFunction, isNumber, isString, isValid, merge } from '../common/utils/typeChecks'
import { requestAnimationFrame } from '../common/utils/compatible'
import { index10, getPrecision, nice, round } from '../common/utils/number'
import { calcTextWidth } from '../common/utils/canvas'
import { formatPrecision } from '../common/utils/format'
import { SymbolDefaultPrecisionConstants } from '../common/SymbolInfo'

import AxisImp, {
  type AxisTemplate, type Axis, type AxisRange,
  type AxisTick, type AxisValueToValueCallback,
  type AxisMinSpanCallback, type AxisCreateRangeCallback,
  type AxisPosition
} from './Axis'

import type DrawPane from '../pane/DrawPane'

import { PaneIdConstants } from '../pane/types'
import { UpdateLevel } from '../common/Updater'

export interface YAxisTemplate extends AxisTemplate {
  /**
   * Y-axis scale smoothing time in seconds.
   * Larger value = longer/softer scaling, smaller value = shorter/tighter scaling.
   */
  scaleSmoothTime?: number

  /**
   * MT4-style scale stabilization deadband in pixels.
   * Tiny auto-range shifts under this threshold are ignored.
   */
  scaleDeadbandPx?: number
}

const TICK_COUNT = 8

export interface YAxis extends Axis, Required<YAxisTemplate> {
  isFromZero: () => boolean
  isInCandle: () => boolean
  convertToNicePixel: (value: number) => number
  getDisplayRange: () => { realFrom: number; realTo: number }
}

export type YAxisConstructor = new (parent: DrawPane) => YAxis

export default abstract class YAxisImp extends AxisImp implements YAxis {
  reverse = false
  inside = false
  position: AxisPosition = 'right'
  gap = {
    top: 0.2,
    bottom: 0.1
  }

  // Y-axis range animation state — critically damped smooth spring.
  private _animRealFrom = 0
  private _animRealTo = 0
  private _animVelocityFrom = 0
  private _animVelocityTo = 0
  private _animating = false
  private _prevRealFrom: number | null = null
  private _prevRealTo: number | null = null
  private _lastFrameTime = 0

  // Increase for longer/softer scaling. Decrease for shorter/tighter scaling.
  scaleSmoothTime = 0.34

  // Ignore tiny range target changes to avoid jittery breathing on live ticks.
  scaleDeadbandPx = 2

  createRange: AxisCreateRangeCallback = params => params.defaultRange
  minSpan: AxisMinSpanCallback = precision => index10(-precision)
  valueToRealValue: AxisValueToValueCallback = value => value
  realValueToDisplayValue: AxisValueToValueCallback = value => value
  displayValueToRealValue: AxisValueToValueCallback = value => value
  realValueToValue: AxisValueToValueCallback = value => value
  displayValueToText: ((value: number, precision: number) => string) = (value, precision) => formatPrecision(value, precision)

  constructor (parent: DrawPane, yAxis: YAxisTemplate) {
    super(parent)
    this.override(yAxis)
  }

  override (yAxis: YAxisTemplate): void {
    const {
      name,
      gap,
      ...others
    } = yAxis
    if (!isString(this.name)) {
      this.name = name
    }
    merge(this.gap, gap)
    merge(this, others)
  }

  protected override createRangeImp (): AxisRange {
    const parent = this.getParent()
    const chart = parent.getChart()
    const chartStore = chart.getChartStore()
    const paneId = parent.getId()
    let min = Number.MAX_SAFE_INTEGER
    let max = Number.MIN_SAFE_INTEGER
    let shouldOhlc = false
    let specifyMin = Number.MAX_SAFE_INTEGER
    let specifyMax = Number.MIN_SAFE_INTEGER
    let indicatorPrecision = Number.MAX_SAFE_INTEGER
    const indicators = chartStore.getIndicatorsByPaneId(paneId)
    indicators.forEach(indicator => {
      shouldOhlc ||= indicator.shouldOhlc
      indicatorPrecision = Math.min(indicatorPrecision, indicator.precision)
      if (isNumber(indicator.minValue)) {
        specifyMin = Math.min(specifyMin, indicator.minValue)
      }
      if (isNumber(indicator.maxValue)) {
        specifyMax = Math.max(specifyMax, indicator.maxValue)
      }
    })

    let precision = 4
    const inCandle = this.isInCandle()
    if (inCandle) {
      const pricePrecision = chartStore.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE
      if (indicatorPrecision !== Number.MAX_SAFE_INTEGER) {
        precision = Math.min(indicatorPrecision, pricePrecision)
      } else {
        precision = pricePrecision
      }
    } else {
      if (indicatorPrecision !== Number.MAX_SAFE_INTEGER) {
        precision = indicatorPrecision
      }
    }
    const visibleRangeDataList = chartStore.getVisibleRangeDataList()
    const candleStyles = chart.getStyles().candle
    const isArea = candleStyles.type === 'area'
    const areaValueKey = candleStyles.area.value
    const shouldCompareHighLow = (inCandle && !isArea) || (!inCandle && shouldOhlc)
    visibleRangeDataList.forEach((visibleData) => {
      const dataIndex = visibleData.dataIndex
      const data = visibleData.data.current
      if (isValid(data)) {
        if (shouldCompareHighLow) {
          min = Math.min(min, data.low)
          max = Math.max(max, data.high)
        }
        if (inCandle && isArea) {
          const value = data[areaValueKey]
          if (isNumber(value)) {
            min = Math.min(min, value)
            max = Math.max(max, value)
          }
        }
      }
      indicators.forEach(({ result, figures }) => {
        const data = result[dataIndex] ?? {}
        figures.forEach(figure => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- ignore
          const value = data[figure.key]
          if (isNumber(value)) {
            min = Math.min(min, value)
            max = Math.max(max, value)
          }
        })
      })
    })

    if (min !== Number.MAX_SAFE_INTEGER && max !== Number.MIN_SAFE_INTEGER) {
      min = Math.min(specifyMin, min)
      max = Math.max(specifyMax, max)
    } else {
      min = 0
      max = 10
    }
    const defaultDiff = max - min
    const defaultRange = {
      from: min,
      to: max,
      range: defaultDiff,
      realFrom: min,
      realTo: max,
      realRange: defaultDiff,
      displayFrom: min,
      displayTo: max,
      displayRange: defaultDiff
    }

    const range = this.createRange({
      chart,
      paneId,
      defaultRange
    })
    let realFrom = range.realFrom
    let realTo = range.realTo
    let realRange = range.realRange
    const minSpan = this.minSpan(precision)
    if (
      realFrom === realTo || realRange < minSpan
    ) {
      const minCheck = specifyMin === realFrom
      const maxCheck = specifyMax === realTo
      const halfTickCount = TICK_COUNT / 2
      realFrom = minCheck ? realFrom : (maxCheck ? realFrom - TICK_COUNT * minSpan : realFrom - halfTickCount * minSpan)
      realTo = maxCheck ? realTo : (minCheck ? realTo + TICK_COUNT * minSpan : realTo + halfTickCount * minSpan)
    }

    const height = this.getBounding().height
    const { top, bottom } = this.gap
    let topRate = top
    if (topRate >= 1) {
      topRate = topRate / height
    }
    let bottomRate = bottom
    if (bottomRate >= 1) {
      bottomRate = bottomRate / height
    }
    realRange = realTo - realFrom
    realFrom = realFrom - realRange * bottomRate
    realTo = realTo + realRange * topRate

    // MT4-like stabilization: hold scale when incoming range changes are
    // below a small pixel threshold.
    if (isNumber(this._prevRealFrom) && isNumber(this._prevRealTo)) {
      const heightPx = Math.max(height, 1)
      const prevSpan = Math.max(Math.abs(this._prevRealTo - this._prevRealFrom), Number.EPSILON)
      const valuePerPixel = prevSpan / heightPx
      const deadband = Math.max(this.scaleDeadbandPx, 0) * valuePerPixel

      if (Math.abs(realFrom - this._prevRealFrom) < deadband) {
        realFrom = this._prevRealFrom
      }
      if (Math.abs(realTo - this._prevRealTo) < deadband) {
        realTo = this._prevRealTo
      }
      realRange = realTo - realFrom
    }

    const from = this.realValueToValue(realFrom, { range })
    const to = this.realValueToValue(realTo, { range })
    const displayFrom = this.realValueToDisplayValue(realFrom, { range })
    const displayTo = this.realValueToDisplayValue(realTo, { range })
    return {
      from,
      to,
      range: to - from,
      realFrom,
      realTo,
      realRange: realTo - realFrom,
      displayFrom,
      displayTo,
      displayRange: displayTo - displayFrom
    }
  }

  /**
   * 是否是蜡烛图轴
   * @return {boolean}
   */
  isInCandle (): boolean {
    return this.getParent().getId() === PaneIdConstants.CANDLE
  }

  /**
   * 是否从y轴0开始
   * @return {boolean}
   */
  isFromZero (): boolean {
    return (
      (this.position === 'left' && this.inside) ||
      (this.position === 'right' && !this.inside)
    )
  }

  /**
   * Recomputes the pixel Y for a stored tick at the current animated range.
   * Called by YAxisView every render frame so labels track the spring position.
   */
  tickCoord (tick: AxisTick): number {
    const range = this.getRange()
    return this.convertToPixel(
      this.realValueToValue(
        this.displayValueToRealValue(+(tick.value as string), { range }),
        { range }
      )
    )
  }

  protected override createTicksImp (): AxisTick[] {
    const range = this.getRange()
    const { displayFrom, displayTo, displayRange } = range
    const ticks: AxisTick[] = []

    if (displayRange >= 0) {
      const interval = nice(displayRange / TICK_COUNT)
      const precision = getPrecision(interval)

      const first = round(Math.ceil(displayFrom / interval) * interval, precision)
      const last = round(Math.floor(displayTo / interval) * interval, precision)
      let tickIndex = 0
      let tickValue = first

      if (interval !== 0) {
        while (tickValue <= last) {
          const tickText = tickValue.toFixed(precision)
          ticks[tickIndex] = { text: tickText, coord: 0, value: tickText }
          ++tickIndex
          tickValue += interval
        }
      }
    }

    const pane = this.getParent()
    const height = pane.getYAxisWidget()?.getBounding().height ?? 0
    const chartStore = pane.getChart().getChartStore()
    const optimalTicks: AxisTick[] = []
    const indicators = chartStore.getIndicatorsByPaneId(pane.getId())
    const styles = chartStore.getStyles()
    let precision = 0
    let shouldFormatBigNumber = false
    if (this.isInCandle()) {
      precision = chartStore.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE
    } else {
      indicators.forEach(indicator => {
        precision = Math.max(precision, indicator.precision)
        shouldFormatBigNumber ||= indicator.shouldFormatBigNumber
      })
    }
    const formatter = chartStore.getInnerFormatter()
    const thousandsSeparator = chartStore.getThousandsSeparator()
    const decimalFold = chartStore.getDecimalFold()
    const textHeight = styles.xAxis.tickText.size
    let validY = NaN
    ticks.forEach(({ value }) => {
      let tickText = this.displayValueToText(+value, precision)
      const y = this.convertToPixel(
        this.realValueToValue(
          this.displayValueToRealValue(+value, { range }),
          { range }
        )
      )
      if (shouldFormatBigNumber) {
        tickText = formatter.formatBigNumber(value)
      }
      tickText = decimalFold.format(thousandsSeparator.format(tickText))
      const validYNumber = isNumber(validY)
      if (
        y > textHeight &&
        y < height - textHeight &&
        ((validYNumber && (Math.abs(validY - y) > textHeight * 2)) || !validYNumber)) {
        optimalTicks.push({ text: tickText, coord: y, value })
        validY = y
      }
    })
    if (isFunction(this.createTicks)) {
      return this.createTicks({
        range: this.getRange(),
        bounding: this.getBounding(),
        defaultTicks: optimalTicks
      })
    }
    return optimalTicks
  }

  override getAutoSize (): number {
    const pane = this.getParent()
    const chart = pane.getChart()
    const chartStore = chart.getChartStore()
    const styles = chartStore.getStyles()
    const yAxisStyles = styles.yAxis
    const width = yAxisStyles.size
    if (width !== 'auto') {
      return width
    }
    let yAxisWidth = 0
    if (yAxisStyles.show) {
      if (yAxisStyles.axisLine.show) {
        yAxisWidth += yAxisStyles.axisLine.size
      }
      if (yAxisStyles.tickLine.show) {
        yAxisWidth += yAxisStyles.tickLine.length
      }
      if (yAxisStyles.tickText.show) {
        let textWidth = 0
        this.getTicks().forEach(tick => {
          textWidth = Math.max(textWidth, calcTextWidth(tick.text, yAxisStyles.tickText.size, yAxisStyles.tickText.weight, yAxisStyles.tickText.family))
        })
        yAxisWidth += (yAxisStyles.tickText.marginStart + yAxisStyles.tickText.marginEnd + textWidth)
      }
    }

    const priceMarkStyles = styles.candle.priceMark
    const lastPriceMarkTextVisible = priceMarkStyles.show && priceMarkStyles.last.show && priceMarkStyles.last.text.show
    let lastPriceTextWidth = 0

    const crosshairStyles = styles.crosshair
    const crosshairHorizontalTextVisible = crosshairStyles.show && crosshairStyles.horizontal.show && crosshairStyles.horizontal.text.show
    let crosshairHorizontalTextWidth = 0

    if (lastPriceMarkTextVisible || crosshairHorizontalTextVisible) {
      const pricePrecision = chartStore.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE
      const max = this.getRange().displayTo

      if (lastPriceMarkTextVisible) {
        const dataList = chartStore.getDataList()
        const data = dataList[dataList.length - 1]
        if (isValid(data)) {
          const { paddingLeft, paddingRight, size, family, weight } = priceMarkStyles.last.text
          lastPriceTextWidth = paddingLeft + calcTextWidth(formatPrecision(data.close, pricePrecision), size, weight, family) + paddingRight
          const formatExtendText = chartStore.getInnerFormatter().formatExtendText
          priceMarkStyles.last.extendTexts.forEach((item, index) => {
            const text = formatExtendText({ type: 'last_price', data, index })
            if (text.length > 0 && item.show) {
              lastPriceTextWidth = Math.max(lastPriceTextWidth, item.paddingLeft + calcTextWidth(text, item.size, item.weight, item.family) + item.paddingRight)
            }
          })
        }
      }

      if (crosshairHorizontalTextVisible) {
        const indicators = chartStore.getIndicatorsByPaneId(pane.getId())
        let indicatorPrecision = 0
        let shouldFormatBigNumber = false
        indicators.forEach(indicator => {
          indicatorPrecision = Math.max(indicator.precision, indicatorPrecision)
          shouldFormatBigNumber ||= indicator.shouldFormatBigNumber
        })
        let precision = 2
        if (this.isInCandle()) {
          const lastValueMarkStyles = styles.indicator.lastValueMark
          if (lastValueMarkStyles.show && lastValueMarkStyles.text.show) {
            precision = Math.max(indicatorPrecision, pricePrecision)
          } else {
            precision = pricePrecision
          }
        } else {
          precision = indicatorPrecision
        }
        let valueText = formatPrecision(max, precision)
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ignore
        if (shouldFormatBigNumber) {
          valueText = chartStore.getInnerFormatter().formatBigNumber(valueText)
        }
        valueText = chartStore.getDecimalFold().format(valueText)
        crosshairHorizontalTextWidth += (
          crosshairStyles.horizontal.text.paddingLeft +
          crosshairStyles.horizontal.text.paddingRight +
          crosshairStyles.horizontal.text.borderSize * 2 +
          calcTextWidth(
            valueText,
            crosshairStyles.horizontal.text.size,
            crosshairStyles.horizontal.text.weight,
            crosshairStyles.horizontal.text.family
          )
        )
      }
    }
    // Round up to the nearest 4px so that 1–3 px fluctuations in the price-label
    // text width (as digits change) don't trigger forceMeasureWidth → canvas resize → blink.
    const raw = Math.max(yAxisWidth, lastPriceTextWidth, crosshairHorizontalTextWidth)
    return Math.ceil(raw / 4) * 4
  }

  protected override getBounding (): Bounding {
    return this.getParent().getYAxisWidget()!.getBounding()
  }

  convertFromPixel (pixel: number): number {
    const height = this.getBounding().height
    const range = this.getRange()
    const { realFrom, realRange } = range
    const rate = this.reverse ? pixel / height : 1 - pixel / height
    const realValue = rate * realRange + realFrom
    return this.realValueToValue(realValue, { range })
  }

  override buildTicks (force: boolean): boolean {
    const wasAutoCalc = this.getAutoCalcTickFlag()
    const result = super.buildTicks(force)
    if (wasAutoCalc) {
      const { realFrom, realTo } = this.getRange()
      if (this._prevRealFrom === null) {
        // First call — seed the spring position at target so no initial animation
        this._animRealFrom = realFrom
        this._animRealTo = realTo
        this._animVelocityFrom = 0
        this._animVelocityTo = 0
      } else {
        // New target — spring will chase it each frame
        if (!this._animating) {
          this._animating = true
          this._lastFrameTime = performance.now()
          this._driveSpring()
        }
      }
      this._prevRealFrom = realFrom
      this._prevRealTo = realTo
    }
    return result
  }

  private _smoothDamp (
    current: number,
    target: number,
    velocity: number,
    deltaTime: number
  ): { value: number, velocity: number } {
    // Critically-damped smoothing (Unity SmoothDamp variant) to avoid jerk.
    const configured = Number.isFinite(this.scaleSmoothTime) ? this.scaleSmoothTime : 0.28
    const smoothTime = Math.max(0.08, Math.min(configured, 1.2))
    const omega = 2 / smoothTime
    const x = omega * deltaTime
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
    const change = current - target
    const temp = (velocity + omega * change) * deltaTime
    const nextVelocity = (velocity - omega * temp) * exp
    const nextValue = target + (change + temp) * exp
    return { value: nextValue, velocity: nextVelocity }
  }

  private _driveSpring (): void {
    const pane = this.getParent()
    const chart = pane.getChart()
    const paneId = pane.getId()
    const step = (): void => {
      if (!this._animating) return
      const now = performance.now()
      // Cap wall-clock delta and integrate in small fixed chunks.
      // This removes visible stepping after long frames / GC pauses.
      let dt = Math.min((now - this._lastFrameTime) / 1000, 0.12)
      this._lastFrameTime = now
      const targetFrom = this._prevRealFrom ?? this._animRealFrom
      const targetTo = this._prevRealTo ?? this._animRealTo

      const fixedStep = 1 / 120
      while (dt > 0) {
        const stepDt = Math.min(fixedStep, dt)
        const nextFrom = this._smoothDamp(this._animRealFrom, targetFrom, this._animVelocityFrom, stepDt)
        const nextTo = this._smoothDamp(this._animRealTo, targetTo, this._animVelocityTo, stepDt)
        this._animRealFrom = nextFrom.value
        this._animRealTo = nextTo.value
        this._animVelocityFrom = nextFrom.velocity
        this._animVelocityTo = nextTo.velocity
        dt -= stepDt
      }

      const span = Math.max(Math.abs(targetTo - targetFrom), 1)
      const posEps = span * 1e-5
      const velEps = span * 1e-4
      const settled =
        Math.abs(this._animRealFrom - targetFrom) < posEps &&
        Math.abs(this._animRealTo - targetTo) < posEps &&
        Math.abs(this._animVelocityFrom) < velEps &&
        Math.abs(this._animVelocityTo) < velEps
      if (settled) {
        this._animRealFrom = targetFrom
        this._animRealTo = targetTo
        this._animVelocityFrom = 0
        this._animVelocityTo = 0
        this._animating = false
        chart.updatePane(UpdateLevel.Main, paneId)
      } else {
        chart.updatePane(UpdateLevel.Main, paneId)
        requestAnimationFrame(step)
      }
    }
    requestAnimationFrame(step)
  }

  /**
   * Returns the current animated realFrom/realTo for rendering.
   * Other code (WebGL renderers etc.) should call this instead of getRange().
   */
  getDisplayRange (): { realFrom: number; realTo: number } {
    if (this._animating || this._prevRealFrom !== null) {
      return { realFrom: this._animRealFrom, realTo: this._animRealTo }
    }
    const r = this.getRange()
    return { realFrom: r.realFrom, realTo: r.realTo }
  }

  convertToPixel (value: number): number {
    const range = this.getRange()
    const realValue = this.valueToRealValue(value, { range })
    const height = this.getParent().getYAxisWidget()?.getBounding().height ?? 0
    const { realFrom, realTo } = this.getDisplayRange()
    const realRange = realTo - realFrom
    if (realRange === 0) return 0
    const rate = (realValue - realFrom) / realRange
    return this.reverse ? rate * height : (1 - rate) * height
  }

  convertToNicePixel (value: number): number {
    const height = this.getParent().getYAxisWidget()?.getBounding().height ?? 0
    const pixel = this.convertToPixel(value)
    return Math.max(height * 0.05, Math.min(pixel, height * 0.98))
  }

  static extend (template: YAxisTemplate): YAxisConstructor {
    class Custom extends YAxisImp {
      constructor (parent: DrawPane) {
        super(parent, template)
      }
    }
    return Custom
  }
}
