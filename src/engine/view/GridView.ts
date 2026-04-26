import type { LineAttrs } from '../extension/figure/line'

import View from './View'
import { getLineRenderer, type LineSegmentData } from '../common/IndicatorLineWebGLRenderer'
import { getSharedIndicatorGLCanvas } from '../common/SharedIndicatorGLCanvas'

export default class GridView extends View {
  override drawImp (ctx: CanvasRenderingContext2D): void {
    const widget = this.getWidget()
    const pane = this.getWidget().getPane()
    const chart = pane.getChart()
    const bounding = widget.getBounding()

    const styles = chart.getStyles().grid
    const show = styles.show
    if (!show) return

    // GPU path: upload grid segments to the shared indicator GL canvas.
    // IndicatorView calls drawGrid() before draw() so grid lines appear
    // behind indicator lines on the GPU layer.
    const sharedCanvas = getSharedIndicatorGLCanvas(widget)
    const lineRenderer = sharedCanvas !== null ? getLineRenderer(widget) : null
    if (lineRenderer !== null) {
      const gpuSegs: LineSegmentData[] = []
      const horizontalStyles = styles.horizontal
      if (horizontalStyles.show !== false) {
        const yAxis = pane.getAxisComponent()
        const hw = ((horizontalStyles.size as number | undefined) ?? 1) / 2
        for (const tick of yAxis.getTicks()) {
          gpuSegs.push({
            x0: 0, y0: tick.coord,
            x1: bounding.width, y1: tick.coord,
            halfWidth: hw,
            color: horizontalStyles.color as string
          })
        }
      }
      const verticalStyles = styles.vertical
      if (verticalStyles.show !== false) {
        const xAxis = chart.getXAxisPane().getAxisComponent()
        const hw = ((verticalStyles.size as number | undefined) ?? 1) / 2
        for (const tick of xAxis.getTicks()) {
          gpuSegs.push({
            x0: tick.coord, y0: 0,
            x1: tick.coord, y1: bounding.height,
            halfWidth: hw,
            color: verticalStyles.color as string
          })
        }
      }
      lineRenderer.setGridLines(gpuSegs)
      return
    }

    // Canvas2D fallback (GL canvas not yet available)
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
  }
}
