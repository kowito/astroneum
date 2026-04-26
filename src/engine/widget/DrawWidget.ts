import type Bounding from '../common/Bounding'
import { UpdateLevel } from '../common/Updater'
import Canvas from '../common/Canvas'

import type DrawPane from '../pane/DrawPane'
import { TextWebGLRenderer } from '../common/TextWebGLRenderer'
import type { TextItem } from '../common/TextWebGLRenderer'

import Widget from './Widget'

import { createDom } from '../common/utils/dom'
import { getPixelRatio } from '../common/utils/canvas'

export default abstract class DrawWidget<P extends DrawPane = DrawPane> extends Widget<P> {
  private readonly _mainCanvas: Canvas
  private readonly _overlayCanvas: Canvas
  /** GPU text renderer — null when WebGL2 is unavailable. */
  private readonly _textRenderer: TextWebGLRenderer | null

  constructor (rootContainer: HTMLElement, pane: P) {
    super(rootContainer, pane)
    const container = this.getContainer()

    // Initialise text renderer first so canvas order is: GL(z1) < 2D(z2) < text(z3)
    this._textRenderer = TextWebGLRenderer.isSupported()
      ? new TextWebGLRenderer(container)
      : null

    this._mainCanvas = new Canvas({
      position: 'absolute',
      top: '0',
      left: '0',
      zIndex: '2',
      boxSizing: 'border-box'
    }, () => {
      this._textRenderer?.beginMainFrame()
      this.updateMain(this._mainCanvas.getContext())
      this._textRenderer?.flush()
    })
    this._overlayCanvas = new Canvas({
      position: 'absolute',
      top: '0',
      left: '0',
      zIndex: '2',
      boxSizing: 'border-box'
    }, () => {
      this._textRenderer?.beginOverlayFrame()
      this.updateOverlay(this._overlayCanvas.getContext())
      this._textRenderer?.flush()
    })
    container.appendChild(this._mainCanvas.getElement())
    container.appendChild(this._overlayCanvas.getElement())
  }

  override createContainer (): HTMLElement {
    return createDom('div', {
      margin: '0',
      padding: '0',
      position: 'absolute',
      top: '0',
      overflow: 'hidden',
      boxSizing: 'border-box',
      zIndex: '1',
      backgroundColor: 'inherit'
    })
  }

  /** Returns the GPU text renderer for this widget, or null if WebGL2 is unavailable. */
  getTextRenderer (): TextWebGLRenderer | null {
    return this._textRenderer
  }

  /**
   * Queue a text item for GL rendering in the current frame phase.
   * Shorthand for `getTextRenderer()?.queue(item)` used by views.
   */
  queueText (item: TextItem): void {
    this._textRenderer?.queue(item)
  }

  override updateImp (container: HTMLElement, bounding: Bounding, level: UpdateLevel): void {
    const { width, height, left } = bounding
    container.style.left = `${left}px`

    let l = level
    const w = container.clientWidth
    const h = container.clientHeight
    if (width !== w || height !== h) {
      container.style.width = `${width}px`
      container.style.height = `${height}px`
      this._textRenderer?.resize(width, height)
      l = UpdateLevel.Drawer
    }
    switch (l) {
      case UpdateLevel.Main: {
        this._mainCanvas.update(width, height)
        break
      }
      case UpdateLevel.Overlay: {
        this._overlayCanvas.update(width, height)
        break
      }
      case UpdateLevel.Drawer:
      case UpdateLevel.All: {
        this._mainCanvas.update(width, height)
        this._overlayCanvas.update(width, height)
        break
      }
      default: {
        break
      }
    }
  }

  destroy (): void {
    this._mainCanvas.destroy()
    this._overlayCanvas.destroy()
    this._textRenderer?.destroy()
  }

  getImage (includeOverlay: boolean): HTMLCanvasElement {
    const { width, height } = this.getBounding()
    const canvas = createDom('canvas', {
      width: `${width}px`,
      height: `${height}px`,
      boxSizing: 'border-box'
    })
    const ctx = canvas.getContext('2d')!
    const pixelRatio = getPixelRatio(canvas)
    canvas.width = width * pixelRatio
    canvas.height = height * pixelRatio
    ctx.scale(pixelRatio, pixelRatio)

    ctx.drawImage(this._mainCanvas.getElement(), 0, 0, width, height)

    if (includeOverlay) {
      ctx.drawImage(this._overlayCanvas.getElement(), 0, 0, width, height)
    }
    return canvas
  }

  protected abstract updateMain (ctx: CanvasRenderingContext2D): void
  protected abstract updateOverlay (ctx: CanvasRenderingContext2D): void
}
