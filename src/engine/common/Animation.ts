// @ts-nocheck

import type Nullable from './Nullable'
import { requestAnimationFrame } from './utils/compatible'
import { merge } from './utils/typeChecks'

type AnimationDoFrameCallback = (frameTime: number) => void

interface AnimationOptions {
  duration: number
  iterationCount: number
}

export default class Animation {
  private readonly _options = { duration: 500, iterationCount: 1 }

  private _doFrameCallback: Nullable<AnimationDoFrameCallback>

  private _currentIterationCount = 0
  private _running = false

  private _time = 0

  constructor (options?: Partial<AnimationOptions>) {
    merge(this._options, options)
  }

  _loop (): void {
    this._running = true
    const step: (() => void) = () => {
      if (this._running) {
        const diffTime = performance.now() - this._time
        if (diffTime < this._options.duration) {
          this._doFrameCallback?.(diffTime)
          requestAnimationFrame(step)
        } else {
          this.stop()
          this._currentIterationCount++
          if (this._currentIterationCount < this._options.iterationCount) {
            this.start()
          }
        }
      }
    }
    requestAnimationFrame(step)
  }

  doFrame (callback: AnimationDoFrameCallback): this {
    this._doFrameCallback = callback
    return this
  }

  setDuration (duration: number): this {
    this._options.duration = duration
    return this
  }

  setIterationCount (iterationCount: number): this {
    this._options.iterationCount = iterationCount
    return this
  }

  start (): void {
    if (!this._running) {
      this._time = performance.now()
      this._loop()
    }
  }

  stop (): void {
    if (this._running) {
      this._doFrameCallback?.(this._options.duration)
    }
    this._running = false
  }
}
