import type { LineAttrs } from '../extension/figure/line'

import View from './View'
import { getLineRenderer } from '../common/IndicatorLineWebGLRenderer'
import { getOrCreateColor } from '../common/candleShaders'
import { InstanceStaging, packSegment, SEGMENT_BYTES, type Rgba } from '../common/instancePacking'

export default class GridView extends View {
  // Grid lines go to the pane's GPU line renderer once IndicatorView has created
  // one; until then (and without WebGL2) they are drawn with Canvas2D.
  private readonly _staging = new InstanceStaging(SEGMENT_BYTES, 64)
  private readonly _colorCache = new Map<string, Rgba>()

  override drawImp (ctx: CanvasRenderingContext2D): void {
    const widget = this.getWidget()
    const pane = this.getWidget().getPane()
    const chart = pane.getChart()
    const bounding = widget.getBounding()

    const styles = chart.getStyles().grid
    const show = styles.show
    if (!show) return

    const horizontalStyles = styles.horizontal
    const verticalStyles = styles.vertical

    // IndicatorView draws the grid buffer before the indicator lines, so grid
    // lines appear behind them on the GPU layer.
    const lineRenderer = getLineRenderer(widget)
    if (lineRenderer !== null) {
      const staging = this._staging
      staging.reset()
      if (horizontalStyles.show) {
        const yAxis = pane.getAxisComponent()
        const halfWidth = ((horizontalStyles.size as number | undefined) ?? 1) / 2
        const color = getOrCreateColor(horizontalStyles.color as string, this._colorCache)
        for (const tick of yAxis.getTicks()) {
          packSegment(staging, 0, tick.coord, bounding.width, tick.coord, halfWidth, color)
        }
      }
      if (verticalStyles.show) {
        const xAxis = chart.getXAxisPane().getAxisComponent()
        const halfWidth = ((verticalStyles.size as number | undefined) ?? 1) / 2
        const color = getOrCreateColor(verticalStyles.color as string, this._colorCache)
        for (const tick of xAxis.getTicks()) {
          packSegment(staging, tick.coord, 0, tick.coord, bounding.height, halfWidth, color)
        }
      }
      lineRenderer.uploadGrid(staging)
      return
    }

    if (horizontalStyles.show) {
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
    if (verticalStyles.show) {
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
  }
}
