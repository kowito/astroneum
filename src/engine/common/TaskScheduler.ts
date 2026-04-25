import type Nullable from './Nullable'
import { isValid } from './utils/typeChecks'

type TaskFinishedCallback = () => void

export default class TaskScheduler {
  private _holdingTasks: Nullable<Record<string, Promise<unknown>>> = null

  private _running = false

  private readonly _callback: Nullable<TaskFinishedCallback>

  constructor (callback: TaskFinishedCallback) {
    this._callback = callback
  }

  add (tasks: Record<string, Promise<unknown>>): void {
    if (!this._running) {
      void this._runTask(tasks)
    } else {
      if (isValid(this._holdingTasks)) {
        this._holdingTasks = {
          ...this._holdingTasks,
          ...tasks
        }
      } else {
        this._holdingTasks = tasks
      }
    }
  }

  private async _runTask (tasks: Record<string, Promise<unknown>>): Promise<void> {
    this._running = true
    try {
      await Promise.all(Object.values(tasks))
    } finally {
      this._running = false
      this._callback?.()
      if (isValid(this._holdingTasks)) {
        const next = this._holdingTasks
        void this._runTask(next)
        this._holdingTasks = null
      }
    }
  }

  clear (): void {
    this._holdingTasks = null
  }
}
