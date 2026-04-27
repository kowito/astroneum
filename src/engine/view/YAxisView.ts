import type Bounding from '../common/Bounding'
import type { AxisStyle, Styles } from '../common/Styles'

import type { LineAttrs } from '../extension/figure/line'
import type { TextAttrs } from '../extension/figure/text'

import type { AxisTick } from '../component/Axis'
import type { YAxis } from '../component/YAxis'
import YAxisImp from '../component/YAxis'

import AxisView from './AxisView'

export default class YAxisView extends AxisView<YAxis> {
  override getAxisStyles (styles: Styles): AxisStyle {
    return styles.yAxis
  }

  override createAxisLine (bounding: Bounding, styles: AxisStyle): LineAttrs {
    const yAxis = this.getWidget().getPane().getAxisComponent()
    const size = styles.axisLine.size
    let x = 0
    if (yAxis.isFromZero()) {
      x = 0
    } else {
      x = bounding.width - size
    }
    return {
      coordinates: [
        { x, y: 0 },
        { x, y: bounding.height }
      ]
    }
  }

  override createTickLines (ticks: AxisTick[], bounding: Bounding, styles: AxisStyle): LineAttrs[] {
    const yAxis = this.getWidget().getPane().getAxisComponent()
    const axisLineStyles = styles.axisLine
    const tickLineStyles = styles.tickLine

    let startX = 0
    let endX = 0
    if (yAxis.isFromZero()) {
      startX = 0
      if (axisLineStyles.show) {
        startX += axisLineStyles.size
      }
      endX = startX + tickLineStyles.length
    } else {
      startX = bounding.width
      if (axisLineStyles.show) {
        startX -= axisLineStyles.size
      }
      endX = startX - tickLineStyles.length
    }
    return ticks.map(tick => {
      // Recompute Y every render frame so labels track the spring animation.
      const y = (yAxis instanceof YAxisImp) ? yAxis.tickCoord(tick) : tick.coord
      return {
        coordinates: [
          { x: startX, y },
          { x: endX, y }
        ]
      }
    })
  }

  override createTickTexts (ticks: AxisTick[], bounding: Bounding, styles: AxisStyle): TextAttrs[] {
    const yAxis = this.getWidget().getPane().getAxisComponent()
    const axisLineStyles = styles.axisLine
    const tickLineStyles = styles.tickLine
    const tickTextStyles = styles.tickText

    let x = 0
    if (yAxis.isFromZero()) {
      x = tickTextStyles.marginStart
      if (axisLineStyles.show) {
        x += axisLineStyles.size
      }
      if (tickLineStyles.show) {
        x += tickLineStyles.length
      }
    } else {
      x = bounding.width - tickTextStyles.marginEnd
      if (axisLineStyles.show) {
        x -= axisLineStyles.size
      }
      if (tickLineStyles.show) {
        x -= tickLineStyles.length
      }
    }
    const textAlign = this.getWidget().getPane().getAxisComponent().isFromZero() ? 'left' : 'right'
    return ticks.map(tick => {
      // Recompute Y every render frame so labels track the spring animation.
      const y = (yAxis instanceof YAxisImp) ? yAxis.tickCoord(tick) : tick.coord
      return {
        x,
        y,
        text: tick.text,
        align: textAlign,
        baseline: 'middle'
      }
    })
  }
}
