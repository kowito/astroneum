import type { LineAttrs } from '../extension/figure/line'

import View from './View'

export default class GridView extends View {
  override drawImp (ctx: CanvasRenderingContext2D): void {
    const widget = this.getWidget()
    const pane = this.getWidget().getPane()
    const chart = pane.getChart()
    const bounding = widget.getBounding()

    const styles = chart.getStyles().grid
    const show = styles.show

    if (show) {
      ctx.save()
      ctx.globalCompositeOperation = 'destination-over'
      const horizontalStyles = styles.horizontal
      const horizontalShow = horizontalStyles.show
      if (horizontalShow) {
        const yAxis = pane.getAxisComponent()
        const attrs: LineAttrs[] = yAxis.getTicks().map(tick => ({
          coordinates: [
            { x: 0, y: tick.coord },
            { x: bounding.width, y: tick.coord }
          ]
        }))
        this.createFigure({
          name: 'line',
          attrs,
          styles: horizontalStyles
        })?.draw(ctx)
      }
      const verticalStyles = styles.vertical
      const verticalShow = verticalStyles.show
      if (verticalShow) {
        const xAxis = chart.getXAxisPane().getAxisComponent()
        const attrs: LineAttrs[] = xAxis.getTicks().map(tick => ({
          coordinates: [
            { x: tick.coord, y: 0 },
            { x: tick.coord, y: bounding.height }
          ]
        }))
        this.createFigure({
          name: 'line',
          attrs,
          styles: verticalStyles
        })?.draw(ctx)
      }
      ctx.restore()
    }
  }
}
