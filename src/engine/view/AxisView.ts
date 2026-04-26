import type Bounding from '../common/Bounding'
import type { AxisStyle, Styles } from '../common/Styles'

import type { LineAttrs } from '../extension/figure/line'
import type { TextAttrs } from '../extension/figure/text'

import type { AxisTick, Axis } from '../component/Axis'

import type DrawWidget from '../widget/DrawWidget'

import View from './View'

export default abstract class AxisView<C extends Axis = Axis> extends View<C> {
  override drawImp (ctx: CanvasRenderingContext2D, extend: unknown[]): void {
    const widget = this.getWidget()
    const pane = widget.getPane()
    const bounding = widget.getBounding()
    const axis = pane.getAxisComponent()
    const styles: AxisStyle = this.getAxisStyles(pane.getChart().getStyles())
    if (styles.show) {
      if (styles.axisLine.show) {
        this.createFigure({
          name: 'line',
          attrs: this.createAxisLine(bounding, styles),
          styles: styles.axisLine
        })?.draw(ctx)
      }
      if (!(extend[0] as boolean)) {
        const ticks = axis.getTicks()
        if (styles.tickLine.show) {
          const lines = this.createTickLines(ticks, bounding, styles)
          lines.forEach(line => {
            this.createFigure({
              name: 'line',
              attrs: line,
              styles: styles.tickLine
            })?.draw(ctx)
          })
        }
        if (styles.tickText.show) {
          const texts = this.createTickTexts(ticks, bounding, styles)
          // Prefer GPU text via TextWebGLRenderer; fall back to Canvas2D.
          const tr = (widget as DrawWidget).getTextRenderer()
          if (tr !== null) {
            const ts = styles.tickText
            const color: string = ts.color ?? '#888888'
            const fontSize: number = ts.size ?? 12
            const fontFamily: string = ts.family ?? 'Helvetica Neue'
            for (const t of texts) {
              tr.queue({
                text: t.text,
                x: t.x,
                y: t.y,
                fontSize,
                fontFamily,
                color,
                align: t.align,
                baseline: t.baseline
              })
            }
          } else {
            this.createFigure({
              name: 'text',
              attrs: texts,
              styles: styles.tickText
            })?.draw(ctx)
          }
        }
      }
    }
  }

  protected abstract getAxisStyles (styles: Styles): AxisStyle

  protected abstract createAxisLine (bounding: Bounding, styles: AxisStyle): LineAttrs
  protected abstract createTickLines (ticks: AxisTick[], bounding: Bounding, styles: AxisStyle): LineAttrs[]
  protected abstract createTickTexts (tick: AxisTick[], bounding: Bounding, styles: AxisStyle): TextAttrs[]
}
