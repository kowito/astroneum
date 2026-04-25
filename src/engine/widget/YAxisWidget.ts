import type DrawPane from '../pane/DrawPane'

import { WidgetNameConstants } from './types'
import DrawWidget from './DrawWidget'

import type { YAxis } from '../component/YAxis'

import YAxisView from '../view/YAxisView'
import CandleLastPriceLabelView from '../view/CandleLastPriceLabelView'
import IndicatorLastValueView from '../view/IndicatorLastValueView'
import OverlayYAxisView from '../view/OverlayYAxisView'
import CrosshairHorizontalLabelView from '../view/CrosshairHorizontalLabelView'

export default class YAxisWidget extends DrawWidget<DrawPane<YAxis>> {
  private readonly _yAxisView = new YAxisView(this)
  private readonly _candleLastPriceLabelView = new CandleLastPriceLabelView(this)
  private readonly _indicatorLastValueView = new IndicatorLastValueView(this)
  private readonly _overlayYAxisView = new OverlayYAxisView(this)
  private readonly _crosshairHorizontalLabelView = new CrosshairHorizontalLabelView(this)

  constructor (rootContainer: HTMLElement, pane: DrawPane<YAxis>) {
    super(rootContainer, pane)
    this.setCursor('ns-resize')
    this.addChild(this._overlayYAxisView)
  }

  override getName (): string {
    return WidgetNameConstants.Y_AXIS
  }

  override updateMain (ctx: CanvasRenderingContext2D): void {
    const minimize = this.getPane().getOptions().state === 'minimize'
    this._yAxisView.draw(ctx, minimize)
    if (!minimize) {
      if (this.getPane().getAxisComponent().isInCandle()) {
        this._candleLastPriceLabelView.draw(ctx)
      }
      this._indicatorLastValueView.draw(ctx)
    }
  }

  override updateOverlay (ctx: CanvasRenderingContext2D): void {
    if (this.getPane().getOptions().state !== 'minimize') {
      this._overlayYAxisView.draw(ctx)
      this._crosshairHorizontalLabelView.draw(ctx)
    }
  }
}
