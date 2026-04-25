export class WebGLCanvas {
  private readonly _gl: WebGL2RenderingContext
  private readonly _element: HTMLCanvasElement

  constructor (container: HTMLElement) {
    this._element = document.createElement('canvas')
    container.appendChild(this._element)
    const gl = this._element.getContext('webgl2', {
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance'
    })
    if (gl === null) {
      this._element.remove()
      throw new Error('[astroneum] WebGL2 not supported — falling back to Canvas2D')
    }
    this._gl = gl
  }

  get gl (): WebGL2RenderingContext { return this._gl }
  get element (): HTMLCanvasElement { return this._element }

  resize (width: number, height: number, pixelRatio: number): void {
    this._element.width = Math.round(width * pixelRatio)
    this._element.height = Math.round(height * pixelRatio)
    this._element.style.width = `${width}px`
    this._element.style.height = `${height}px`
    this._gl.viewport(0, 0, this._element.width, this._element.height)
  }

  destroy (): void {
    const ext = this._gl.getExtension('WEBGL_lose_context')
    ext?.loseContext()
    this._element.remove()
  }

  static isSupported (): boolean {
    return _webgl2Supported
  }
}

// Single probe at module load — same rationale as CandleWebGLRenderer.
const _webgl2Supported: boolean = (() => {
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2')
    if (gl === null) return false
    const ext = gl.getExtension('WEBGL_lose_context')
    ext?.loseContext()
    return true
  } catch {
    return false
  }
})()
