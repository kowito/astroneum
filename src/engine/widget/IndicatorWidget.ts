import type DrawPane from '../pane/DrawPane'

import { WidgetNameConstants } from './types'
import DrawWidget from './DrawWidget'

import type { YAxis } from '../component/YAxis'

import GridView from '../view/GridView'
import IndicatorView from '../view/IndicatorView'
import CrosshairLineView from '../view/CrosshairLineView'
import IndicatorTooltipView from '../view/IndicatorTooltipView'
import OverlayView from '../view/OverlayView'
import { destroyLineRenderer } from '../common/IndicatorLineWebGLRenderer'
import { destroyIndicatorPluginRenderer } from '../common/IndicatorPluginWebGLRenderer'
import { destroyRectRenderer } from '../common/IndicatorRectWebGLRenderer'
import { destroySharedIndicatorGLCanvas } from '../common/SharedIndicatorGLCanvas'

export default class IndicatorWidget extends DrawWidget<DrawPane<YAxis>> {
  private readonly _gridView = new GridView(this)
  private readonly _indicatorView = new IndicatorView(this)
  private readonly _crosshairLineView = new CrosshairLineView(this)
  private readonly _tooltipView = this.createTooltipView()
  private readonly _overlayView = new OverlayView(this)

  constructor (rootContainer: HTMLElement, pane: DrawPane<YAxis>) {
    super(rootContainer, pane)
    this.addChild(this._tooltipView)
    this.addChild(this._overlayView)
  }

  getName (): string {
    return WidgetNameConstants.MAIN
  }

  protected updateMain (ctx: CanvasRenderingContext2D): void {
    if (this.getPane().getOptions().state !== 'minimize') {
      this.updateMainContent(ctx)
      this._indicatorView.draw(ctx)
      this._gridView.draw(ctx)
    }
  }

  protected createTooltipView (): IndicatorTooltipView {
    return new IndicatorTooltipView(this)
  }

  protected updateMainContent (_ctx: CanvasRenderingContext2D): void {
    // to do it
  }

  protected updateOverlayContent (_ctx: CanvasRenderingContext2D): void {
    // to do it
  }

  override updateOverlay (ctx: CanvasRenderingContext2D): void {
    if (this.getPane().getOptions().state !== 'minimize') {
      this._overlayView.draw(ctx)
      this._crosshairLineView.draw(ctx)
      this.updateOverlayContent(ctx)
    }
    this._tooltipView.draw(ctx)
  }

  override destroy (): void {
    destroyLineRenderer(this)
    destroyRectRenderer(this)
    destroyIndicatorPluginRenderer(this)
    destroySharedIndicatorGLCanvas(this)  // must come after renderer destroys
    super.destroy()
  }
}
