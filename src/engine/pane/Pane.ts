import type Updater from '../common/Updater'
import { UpdateLevel } from '../common/Updater'
import type Bounding from '../common/Bounding'
import { createDefaultBounding } from '../common/Bounding'
import { createDom } from '../common/utils/dom'
import { merge } from '../common/utils/typeChecks'

import type Chart from '../Chart'

export default abstract class Pane implements Updater {
  private readonly _container: HTMLElement
  private readonly _id: string
  private readonly _chart: Chart

  private readonly _bounding = createDefaultBounding()

  private readonly _originalBounding = createDefaultBounding()

  private _visible = true

  constructor (chart: Chart, id: string) {
    this._chart = chart
    this._id = id
    this._container = createDom('div', {
      width: '100%',
      margin: '0',
      padding: '0',
      position: 'relative',
      overflow: 'hidden',
      boxSizing: 'border-box'
    })
  }

  getContainer (): HTMLElement {
    return this._container
  }

  setVisible (visible: boolean): void {
    if (this._visible !== visible) {
      this._container.style.display = visible ? 'block' : 'none'
      this._visible = visible
    }
  }

  getVisible (): boolean {
    return this._visible
  }

  getId (): string {
    return this._id
  }

  getChart (): Chart {
    return this._chart
  }

  getBounding (): Bounding {
    return this._bounding
  }

  setOriginalBounding (bounding: Partial<Bounding>): void {
    merge(this._originalBounding, bounding)
  }

  getOriginalBounding (): Bounding {
    return this._originalBounding
  }

  update (level?: UpdateLevel): void {
    if (this._bounding.height !== this._container.clientHeight) {
      this._container.style.height = `${this._bounding.height}px`
    }
    this.updateImp(level ?? UpdateLevel.Drawer, this._container, this._bounding)
  }

  abstract setBounding (...bounding: Array<Partial<Bounding>>): Pane

  abstract getImage (includeOverlay: boolean): HTMLCanvasElement

  abstract updateImp (level: UpdateLevel, container: HTMLElement, bounding: Bounding): void
}
