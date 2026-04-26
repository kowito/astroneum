import { getPixelRatio } from './utils/canvas'

export class IndicatorPluginWebGLRenderer {
  private readonly _canvas: HTMLCanvasElement
  private readonly _gl: WebGL2RenderingContext
  private readonly _vboCache = new Map<string, WebGLBuffer>()

  constructor (container: HTMLElement) {
    const canvas = document.createElement('canvas')
    canvas.style.position = 'absolute'
    canvas.style.top = '0'
    canvas.style.left = '0'
    canvas.style.zIndex = '1'
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
    if (gl === null) throw new Error('[IndicatorPluginWebGLRenderer] WebGL2 unavailable')
    this._gl = gl

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  }

  getContext (): WebGL2RenderingContext {
    return this._gl
  }

  getOrCreateVbo (key: string): WebGLBuffer {
    let vbo = this._vboCache.get(key)
    if (vbo === undefined) {
      vbo = this._gl.createBuffer() ?? undefined
      if (vbo === undefined) {
        throw new Error('[IndicatorPluginWebGLRenderer] Failed to create buffer')
      }
      this._vboCache.set(key, vbo)
    }
    return vbo
  }

  resize (width: number, height: number): void {
    const pixelRatio = getPixelRatio(this._canvas)
    const newCanvasWidth = Math.round(width * pixelRatio)
    const newCanvasHeight = Math.round(height * pixelRatio)
    if (this._canvas.width === newCanvasWidth && this._canvas.height === newCanvasHeight) return
    this._canvas.style.width = `${width}px`
    this._canvas.style.height = `${height}px`
    this._canvas.width = newCanvasWidth
    this._canvas.height = newCanvasHeight
  }

  beginFrame (): void {
    const gl = this._gl
    gl.viewport(0, 0, this._canvas.width, this._canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }

  destroy (): void {
    this._vboCache.forEach(vbo => {
      this._gl.deleteBuffer(vbo)
    })
    this._vboCache.clear()

    this._gl.getExtension('WEBGL_lose_context')?.loseContext()
    this._canvas.remove()
  }
}

const _pluginGL2Supported: boolean = (() => {
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2')
    if (gl === null) return false
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
})()

const _pluginRendererCache = new WeakMap<object, IndicatorPluginWebGLRenderer>()

export function getIndicatorPluginRenderer (widgetKey: object): IndicatorPluginWebGLRenderer | null {
  return _pluginRendererCache.get(widgetKey) ?? null
}

export function getOrCreateIndicatorPluginRenderer (
  widgetKey: object,
  container: HTMLElement
): IndicatorPluginWebGLRenderer | null {
  if (!_pluginGL2Supported) return null
  let renderer = _pluginRendererCache.get(widgetKey)
  if (renderer === undefined) {
    try {
      renderer = new IndicatorPluginWebGLRenderer(container)
      _pluginRendererCache.set(widgetKey, renderer)
    } catch {
      return null
    }
  }
  return renderer
}

export function destroyIndicatorPluginRenderer (widgetKey: object): void {
  const renderer = _pluginRendererCache.get(widgetKey)
  if (renderer !== undefined) {
    renderer.destroy()
    _pluginRendererCache.delete(widgetKey)
  }
}
