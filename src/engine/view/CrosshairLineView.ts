import type Coordinate from '../common/Coordinate'
import type { CrosshairDirectionStyle } from '../common/Styles'
import { isString } from '../common/utils/typeChecks'

import View from './View'

export default class CrosshairLineView extends View {
  override drawImp (ctx: CanvasRenderingContext2D): void {
    const widget = this.getWidget()
    const pane = widget.getPane()
    const bounding = widget.getBounding()
    const chartStore = widget.getPane().getChart().getChartStore()
    const crosshair = chartStore.getCrosshair()
    const styles = chartStore.getStyles().crosshair
    if (isString(crosshair.paneId) && styles.show) {
      if (crosshair.paneId === pane.getId()) {
        const y = crosshair.y!
        this._drawLine(
          ctx,
          [
            { x: 0, y },
            { x: bounding.width, y }
          ],
          styles.horizontal
        )
      }
      const x = crosshair.realX!
      this._drawLine(
        ctx,
        [
          { x, y: 0 },
          { x, y: bounding.height }
        ],
        styles.vertical
      )
    }
  }

  private _drawLine (ctx: CanvasRenderingContext2D, coordinates: Coordinate[], styles: CrosshairDirectionStyle): void {
    if (styles.show) {
      const lineStyles = styles.line
      if (lineStyles.show) {
        this.createFigure({
          name: 'line',
          attrs: { coordinates },
          styles: lineStyles
        })?.draw(ctx)
      }
    }
  }
}
