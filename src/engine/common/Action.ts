import { isFunction } from './utils/typeChecks'

export type ActionCallback = (data?: unknown) => void

export type ActionType = 'onZoom' | 'onScroll' | 'onVisibleRangeChange' | 'onCandleTooltipFeatureClick' | 'onIndicatorTooltipFeatureClick'| 'onCrosshairFeatureClick' | 'onCrosshairChange' | 'onCandleBarClick' | 'onPaneDrag'
export default class Action {
  private _callbacks: ActionCallback[] = []

  subscribe (callback: ActionCallback): void {
    const index = this._callbacks.indexOf(callback)
    if (index < 0) {
      this._callbacks.push(callback)
    }
  }

  unsubscribe (callback?: ActionCallback): void {
    if (isFunction(callback)) {
      const index = this._callbacks.indexOf(callback)
      if (index > -1) {
        this._callbacks.splice(index, 1)
      }
    } else {
      this._callbacks = []
    }
  }

  execute (data?: unknown): void {
    this._callbacks.forEach(callback => {
      callback(data)
    })
  }

  isEmpty (): boolean {
    return this._callbacks.length === 0
  }
}
