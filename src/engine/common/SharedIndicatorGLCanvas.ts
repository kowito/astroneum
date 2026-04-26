import { getPixelRatio } from './utils/canvas'
import { WebGLCanvas } from './WebGLCanvas'

// ---------------------------------------------------------------------------
// SharedIndicatorGLCanvas — one WebGL2 context per indicator pane widget,
// shared across IndicatorLineWebGLRenderer and IndicatorRectWebGLRenderer.
//
// Browser limit: ~16 WebGL contexts per page.  Before this change each pane
// created up to 4 separate contexts (candle + line + rect + plugin).  With
// a shared context, indicator sub-panes need only 1 context (line + rect
// share) rather than 2, and the main candle pane drops from 3 to 2.
//
// Dirty-frame protocol
// ────────────────────
// 1. View calls setData() on each renderer  →  may increment _vboVersion.
// 2. View calls sharedCanvas.resize()       →  may increment _sizeVersion.
// 3. View checks anyDirty = lineR.isDirty() || rectR.isDirty()
// 4. If anyDirty:  sharedCanvas.beginFrame() then each renderer.draw().
//    If not dirty: skip — canvas retains last-frame content.
//
// beginFrame() clears the canvas ONCE per frame, sets viewport + scissor, and
// saves the caller from having to repeat that across renderers.
// ---------------------------------------------------------------------------

export class SharedIndicatorGLCanvas {
  private readonly _canvas: HTMLCanvasElement
  private readonly _gl: WebGL2RenderingContext
  // Incremented whenever the canvas dimensions change. Renderers that cache
  // _lastSizeVersion use this to detect stale draws after a resize.
  private _sizeVersion = 0

  constructor (container: HTMLElement) {
    const canvas = document.createElement('canvas')
    canvas.style.position      = 'absolute'
    canvas.style.top           = '0'
    canvas.style.left          = '0'
    canvas.style.zIndex        = '1'   // below Canvas2D layers (z-index 2)
    canvas.style.pointerEvents = 'none'
    container.appendChild(canvas)
    this._canvas = canvas

    const gl = canvas.getContext('webgl2', {
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
      alpha: true
    })
    if (gl === null) {
      canvas.remove()
      throw new Error('[SharedIndicatorGLCanvas] WebGL2 unavailable')
    }
    this._gl = gl

    // Global state — set once, shared by all renderers on this context.
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.disable(gl.DEPTH_TEST)     // 2D rendering only — no depth reads/writes
    gl.enable(gl.SCISSOR_TEST)    // reject fragments outside the pane canvas
  }

  get gl (): WebGL2RenderingContext { return this._gl }
  get canvas (): HTMLCanvasElement  { return this._canvas }

  /** Increments whenever the canvas is resized; renderers use this to detect stale state. */
  get sizeVersion (): number { return this._sizeVersion }

  /**
   * Resize the shared canvas (idempotent — no-op when dimensions are unchanged).
   * Increments sizeVersion so that all renderers' isDirty() returns true after a resize,
   * ensuring they redraw even when their VBO data is unchanged.
   */
  resize (width: number, height: number): void {
    const pixelRatio = getPixelRatio(this._canvas)
    const w = Math.round(width  * pixelRatio)
    const h = Math.round(height * pixelRatio)
    if (this._canvas.width === w && this._canvas.height === h) return
    this._canvas.style.width  = `${width}px`
    this._canvas.style.height = `${height}px`
    this._canvas.width  = w
    this._canvas.height = h
    this._sizeVersion++
  }

  /**
   * Begin a new render frame: set viewport + scissor, clear the canvas.
   * Call exactly ONCE per dirty frame, before any renderer's draw() runs.
   */
  beginFrame (): void {
    const gl = this._gl
    const w  = this._canvas.width
    const h  = this._canvas.height
    gl.viewport(0, 0, w, h)
    gl.scissor(0, 0, w, h)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }

  destroy (): void {
    this._gl.getExtension('WEBGL_lose_context')?.loseContext()
    this._canvas.remove()
  }
}

// ---------------------------------------------------------------------------
// Module-level WeakMap — one SharedIndicatorGLCanvas per pane widget.
// ---------------------------------------------------------------------------

const _cache = new WeakMap<object, SharedIndicatorGLCanvas>()

export function getSharedIndicatorGLCanvas (widgetKey: object): SharedIndicatorGLCanvas | null {
  return _cache.get(widgetKey) ?? null
}

export function getOrCreateSharedIndicatorGLCanvas (
  widgetKey: object,
  container: HTMLElement
): SharedIndicatorGLCanvas | null {
  if (!WebGLCanvas.isSupported()) return null
  let c = _cache.get(widgetKey)
  if (c === undefined) {
    try {
      c = new SharedIndicatorGLCanvas(container)
      _cache.set(widgetKey, c)
    } catch {
      return null
    }
  }
  return c
}

export function destroySharedIndicatorGLCanvas (widgetKey: object): void {
  const c = _cache.get(widgetKey)
  if (c !== undefined) {
    c.destroy()
    _cache.delete(widgetKey)
  }
}
