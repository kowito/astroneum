import { isValid } from './utils/typeChecks'

import type { EventName, MouseTouchEvent, MouseTouchEventCallback } from './EventHandler'

export interface EventDispatcher {
  dispatchEvent: (name: EventName, event: MouseTouchEvent) => boolean
}

export default abstract class Eventful implements EventDispatcher {
  private _children: Eventful[] = []

  private readonly _callbacks = new Map<EventName, MouseTouchEventCallback>()

  registerEvent (name: EventName, callback: MouseTouchEventCallback): this {
    this._callbacks.set(name, callback)
    return this
  }

  onEvent (name: EventName, event: MouseTouchEvent): boolean {
    const callback = this._callbacks.get(name)
    if (isValid(callback) && this.checkEventOn(event)) {
      return callback(event)
    }
    return false
  }

  abstract checkEventOn (event: MouseTouchEvent): boolean

  protected dispatchEventToChildren (name: EventName, event: MouseTouchEvent): boolean {
    const start = this._children.length - 1
    if (start > -1) {
      for (let i = start; i > -1; i--) {
        if (this._children[i].dispatchEvent(name, event)) {
          return true
        }
      }
    }
    return false
  }

  dispatchEvent (name: EventName, event: MouseTouchEvent): boolean {
    if (this.dispatchEventToChildren(name, event)) {
      return true
    }
    return this.onEvent(name, event)
  }

  addChild (eventful: Eventful): this {
    this._children.push(eventful)
    return this
  }

  clear (): void {
    this._children = []
  }
}
