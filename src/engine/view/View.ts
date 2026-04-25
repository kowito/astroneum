// @ts-nocheck

import type Nullable from '../common/Nullable'
import type { EventHandler, EventName, MouseTouchEvent } from '../common/EventHandler'
import Eventful from '../common/Eventful'
import { isValid } from '../common/utils/typeChecks'

import type Figure from '../component/Figure'
import type { Axis } from '../component/Axis'
import type { FigureCreate } from '../component/Figure'

import { getInnerFigureClass } from '../extension/figure/index'

import type DrawWidget from '../widget/DrawWidget'
import type DrawPane from '../pane/DrawPane'

export default abstract class View<C extends Axis = Axis> extends Eventful {
  /**
   * Parent widget
   */
  private readonly _widget: DrawWidget<DrawPane<C>>

  constructor (widget: DrawWidget<DrawPane<C>>) {
    super()
    this._widget = widget
  }

  getWidget (): DrawWidget<DrawPane<C>> { return this._widget }

  protected createFigure (create: FigureCreate, eventHandler?: EventHandler): Nullable<Figure> {
    const FigureClazz = getInnerFigureClass(create.name)
    if (FigureClazz !== null) {
      const figure = new FigureClazz(create)
      if (isValid(eventHandler)) {
        for (const key in eventHandler) {
          // eslint-disable-next-line no-prototype-builtins -- ignore
          if (eventHandler.hasOwnProperty(key)) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- ignore
            figure.registerEvent(key as EventName, eventHandler[key])
          }
        }
        this.addChild(figure)
      }
      return figure
    }
    return null
  }

  draw (ctx: CanvasRenderingContext2D, ...extend: unknown[]): void {
    this.clear()
    this.drawImp(ctx, extend)
  }

  checkEventOn (_: MouseTouchEvent): boolean {
    return true
  }

  protected abstract drawImp (ctx: CanvasRenderingContext2D, ...extend: unknown[]): void
}
