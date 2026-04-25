import { WidgetNameConstants } from './types'
import DrawWidget from './DrawWidget'

import type DrawPane from '../pane/DrawPane'

import type { XAxis } from '../component/XAxis'

import XAxisView from '../view/XAxisView'
import OverlayXAxisView from '../view/OverlayXAxisView'
import CrosshairVerticalLabelView from '../view/CrosshairVerticalLabelView'

export default class XAxisWidget extends DrawWidget<DrawPane<XAxis>> {
  private readonly _xAxisView = new XAxisView(this)
  private readonly _overlayXAxisView = new OverlayXAxisView(this)
  private readonly _crosshairVerticalLabelView = new CrosshairVerticalLabelView(this)

  constructor (rootContainer: HTMLElement, pane: DrawPane<XAxis>) {
    super(rootContainer, pane)
    this.setCursor('ew-resize')
    this.addChild(this._overlayXAxisView)
  }

  override getName (): string {
    return WidgetNameConstants.X_AXIS
  }

  override updateMain (ctx: CanvasRenderingContext2D): void {
    this._xAxisView.draw(ctx)
  }

  override updateOverlay (ctx: CanvasRenderingContext2D): void {
    this._overlayXAxisView.draw(ctx)
    this._crosshairVerticalLabelView.draw(ctx)
  }
}
