import IndicatorWidget from './IndicatorWidget'

import CandleBarView from '../view/CandleBarView'
import CandleAreaView from '../view/CandleAreaView'
import CandleHighLowPriceView from '../view/CandleHighLowPriceView'
import CandleLastPriceLineView from '../view/CandleLastPriceLineView'

import type IndicatorTooltipView from '../view/IndicatorTooltipView'
import CandleTooltipView from '../view/CandleTooltipView'
import CrosshairFeatureView from '../view/CrosshairFeatureView'

import type AxisPane from '../pane/DrawPane'

import type { YAxis } from '../component/YAxis'
import { destroyRenderer } from '../common/CandleWebGLRenderer'
import { destroyWorkerRenderer } from '../common/CandleWorkerRenderer'

export default class CandleWidget extends IndicatorWidget {
  private readonly _candleBarView = new CandleBarView(this)
  private readonly _candleAreaView = new CandleAreaView(this)
  private readonly _candleHighLowPriceView = new CandleHighLowPriceView(this)
  private readonly _candleLastPriceLineView = new CandleLastPriceLineView(this)
  private readonly _crosshairFeatureView = new CrosshairFeatureView(this)

  constructor (rootContainer: HTMLElement, pane: AxisPane<YAxis>) {
    super(rootContainer, pane)
    this.addChild(this._candleBarView)
    this.addChild(this._crosshairFeatureView)
  }

  override updateMainContent (ctx: CanvasRenderingContext2D): void {
    const candleStyles = this.getPane().getChart().getStyles().candle
    if (candleStyles.type !== 'area') {
      this._candleBarView.draw(ctx)
      this._candleHighLowPriceView.draw(ctx)
      this._candleAreaView.stopAnimation()
    } else {
      this._candleAreaView.draw(ctx)
    }
    this._candleLastPriceLineView.draw(ctx)
  }

  override updateOverlayContent (ctx: CanvasRenderingContext2D): void {
    this._crosshairFeatureView.draw(ctx)
  }

  override createTooltipView (): IndicatorTooltipView {
    return new CandleTooltipView(this)
  }

  override destroy (): void {
    destroyWorkerRenderer(this)   // worker renderer (if created)
    destroyRenderer(this)         // main-thread GL renderer (if created)
    super.destroy()
  }
}
