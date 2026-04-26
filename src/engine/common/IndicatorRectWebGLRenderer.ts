import { getPixelRatio } from './utils/canvas'
import { WebGLCanvas } from './WebGLCanvas'

// ---------------------------------------------------------------------------
// GPU rect/bar renderer for histogram-style indicator figures (Priority 4).
//
// Replaces O(N) individual Canvas2D fillRect calls (one per visible bar) with
// a single instanced WebGL2 draw call.  Handles the dominant 'fill' case used
// by volume, MACD histogram, RSI fills, and most custom bar indicators.
//
// Memory layout — packed per-instance VBO  (20 bytes / rect)
//
//  Byte  0– 3  Float32  x         (CSS pixels, left edge)
//  Byte  4– 7  Float32  y         (CSS pixels, top edge)
//  Byte  8–11  Float32  width     (CSS pixels)
//  Byte 12–15  Float32  height    (CSS pixels)
//  Byte 16–19  UByte×4  color     (RGBA, normalized: 0..255 → 0..1)
//
// Coordinate system: CSS pixels, Y=0 at canvas top (matching Canvas2D).
// Shader converts CSS px → NDC (Y-flip included).
//
// GPU path guard: only solid-fill (style='fill'), non-gradient, non-rounded
// rects take this path.  Everything else falls back to Canvas2D.
// ---------------------------------------------------------------------------

const BYTES_PER_RECT = 20
const COLOR_BYTE_OFF = 16   // byte offset of color field
const VERTS_PER_RECT = 6    // two triangles, no index buffer

// ---------------------------------------------------------------------------
// Vertex shader — unit-quad expansion via gl_VertexID
// ---------------------------------------------------------------------------
const VERT_SRC = /* glsl */`#version 300 es
precision highp float;

// Per-instance attributes (divisor = 1)
in float a_x;
in float a_y;
in float a_width;
in float a_height;
in vec4  a_color;    // RGBA, normalized

// Canvas physical dimensions; devicePixelRatio
uniform vec2  u_resolution;
uniform float u_pixelRatio;

out vec4 v_color;

// Unit-quad positions for 6 vertices (two CCW triangles):
//  vi: 0       1       2       3       4       5
//  uv: (0,0)  (1,0)  (0,1)  (0,1)  (1,0)  (1,1)
vec2 unitQuad(int id) {
  if (id == 0) return vec2(0.0, 0.0);
  if (id == 1) return vec2(1.0, 0.0);
  if (id == 2) return vec2(0.0, 1.0);
  if (id == 3) return vec2(0.0, 1.0);
  if (id == 4) return vec2(1.0, 0.0);
                return vec2(1.0, 1.0);
}

void main() {
  vec2 uv  = unitQuad(gl_VertexID % 6);

  // CSS-pixel position of this vertex corner
  vec2 cssPx = vec2(a_x + uv.x * a_width,
                    a_y + uv.y * a_height);

  // CSS px → physical px → NDC (Y-flip: CSS Y=0 is top, NDC Y=+1 is top)
  vec2 physPx = cssPx * u_pixelRatio;
  gl_Position = vec4(
    (physPx.x / u_resolution.x) * 2.0 - 1.0,
    1.0 - (physPx.y / u_resolution.y) * 2.0,
    0.0, 1.0
  );

  v_color = a_color;
}
`

const FRAG_SRC = /* glsl */`#version 300 es
precision mediump float;
in  vec4 v_color;
out vec4 fragColor;
void main() { fragColor = v_color; }
`

// ---------------------------------------------------------------------------
// Shader helpers
// ---------------------------------------------------------------------------

function compileShader (gl: WebGL2RenderingContext, type: GLenum, src: string): WebGLShader {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`[IndicatorRectWebGLRenderer] shader compile error: ${gl.getShaderInfoLog(shader) ?? '?'}`)
  }
  return shader
}

function createProgram (gl: WebGL2RenderingContext): WebGLProgram {
  const vert = compileShader(gl, gl.VERTEX_SHADER,   VERT_SRC)
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC)
  const prog = gl.createProgram()!
  gl.attachShader(prog, vert)
  gl.attachShader(prog, frag)
  gl.linkProgram(prog)
  gl.deleteShader(vert)
  gl.deleteShader(frag)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`[IndicatorRectWebGLRenderer] program link error: ${gl.getProgramInfoLog(prog) ?? '?'}`)
  }
  return prog
}

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

function hexToRgba (hex: string): [number, number, number, number] {
  const h = hex.replace('#', '')
  if (h.length === 6 || h.length === 8) {
    return [
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255,
      h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
    ]
  }
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16) / 255,
      parseInt(h[1] + h[1], 16) / 255,
      parseInt(h[2] + h[2], 16) / 255,
      1
    ]
  }
  return [0, 0, 0, 1]
}

function parseCSSColor (color: string): [number, number, number, number] {
  if (color.startsWith('#')) return hexToRgba(color)
  const m = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/)
  if (m !== null) {
    return [
      parseFloat(m[1]) / 255,
      parseFloat(m[2]) / 255,
      parseFloat(m[3]) / 255,
      m[4] !== undefined ? parseFloat(m[4]) : 1
    ]
  }
  return [0, 0, 0, 1]
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RectInstanceData {
  x: number
  y: number
  width: number
  height: number
  color: string   // any CSS color string (solid fill only)
}

export class IndicatorRectWebGLRenderer {
  private readonly _gl: WebGL2RenderingContext
  private readonly _canvas: HTMLCanvasElement
  private readonly _program: WebGLProgram
  private readonly _vao: WebGLVertexArrayObject
  private readonly _vbo: WebGLBuffer

  private readonly _uResolution: WebGLUniformLocation
  private readonly _uPixelRatio: WebGLUniformLocation

  private _capacity  = 0
  private _rectCount = 0

  private _stagingBuf: ArrayBuffer = new ArrayBuffer(512 * BYTES_PER_RECT)
  private _stagingF32: Float32Array = new Float32Array(this._stagingBuf)
  private _stagingU8:  Uint8Array   = new Uint8Array(this._stagingBuf)

  private readonly _colorCache = new Map<string, readonly [number, number, number, number]>()

  // ---------------------------------------------------------------------------
  // Dirty-flag fingerprint (O(1) — avoids full staging+upload on unchanged frames)
  // ---------------------------------------------------------------------------
  private _fingerprintRectCount = -1
  private _fingerprintFirstX = 0
  private _fingerprintFirstY = 0
  private _fingerprintLastX = 0
  private _fingerprintLastY = 0

  // Sub-pixel culling reuse buffer — grows amortised, never shrinks.
  private readonly _culledBuf: RectInstanceData[] = []

  // ── Incremental dirty tracking ───────────────────────────────────────────────
  //  _vboVersion increments whenever the VBO is actually written.
  //  draw() skips the GL pipeline entirely when _drawnVersion matches.
  private _vboVersion   = 0
  private _drawnVersion = -1

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
    if (gl === null) throw new Error('[IndicatorRectWebGLRenderer] WebGL2 unavailable')
    this._gl = gl

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.disable(gl.DEPTH_TEST)     // 2D only — no depth reads/writes
    gl.enable(gl.SCISSOR_TEST)    // reject fragments outside the pane canvas

    this._program = createProgram(gl)
    gl.useProgram(this._program)

    this._uResolution = gl.getUniformLocation(this._program, 'u_resolution')!
    this._uPixelRatio = gl.getUniformLocation(this._program, 'u_pixelRatio')!

    this._vao = gl.createVertexArray()!
    gl.bindVertexArray(this._vao)

    this._vbo = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo)

    this._setupAttribs(gl)
    gl.bindVertexArray(null)
  }

  // ---------------------------------------------------------------------------
  // Attribute bindings
  // ---------------------------------------------------------------------------

  private _setupAttribs (gl: WebGL2RenderingContext): void {
    const prog   = this._program
    const stride = BYTES_PER_RECT

    const bindF32 = (name: string, byteOffset: number): void => {
      const loc = gl.getAttribLocation(prog, name)
      if (loc < 0) return
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, 1, gl.FLOAT, false, stride, byteOffset)
      gl.vertexAttribDivisor(loc, 1)
    }

    bindF32('a_x',      0)
    bindF32('a_y',      4)
    bindF32('a_width',  8)
    bindF32('a_height', 12)

    const colorLoc = gl.getAttribLocation(prog, 'a_color')
    if (colorLoc >= 0) {
      gl.enableVertexAttribArray(colorLoc)
      gl.vertexAttribPointer(colorLoc, 4, gl.UNSIGNED_BYTE, true, stride, COLOR_BYTE_OFF)
      gl.vertexAttribDivisor(colorLoc, 1)
    }
  }

  // ---------------------------------------------------------------------------
  // Resize
  // ---------------------------------------------------------------------------

  resize (width: number, height: number): void {
    const pixelRatio = getPixelRatio(this._canvas)
    const newCanvasWidth = Math.round(width  * pixelRatio)
    const newCanvasHeight = Math.round(height * pixelRatio)
    if (this._canvas.width === newCanvasWidth && this._canvas.height === newCanvasHeight) return
    this._canvas.style.width  = `${width}px`
    this._canvas.style.height = `${height}px`
    this._canvas.width  = newCanvasWidth
    this._canvas.height = newCanvasHeight
    this._vboVersion++  // canvas reset — force redraw
  }

  // ---------------------------------------------------------------------------
  // VBO management
  // ---------------------------------------------------------------------------

  private _ensureCapacity (count: number): void {
    if (count <= this._capacity) return
    const newCap = Math.max(count, this._capacity * 2, 512)
    this._stagingBuf = new ArrayBuffer(newCap * BYTES_PER_RECT)
    this._stagingF32 = new Float32Array(this._stagingBuf)
    this._stagingU8  = new Uint8Array(this._stagingBuf)
    const gl = this._gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo)
    gl.bufferData(gl.ARRAY_BUFFER, newCap * BYTES_PER_RECT, gl.DYNAMIC_DRAW)
    this._capacity = newCap
  }

  private _parseColorCached (color: string): readonly [number, number, number, number] {
    let cachedColor = this._colorCache.get(color)
    if (cachedColor === undefined) {
      cachedColor = parseCSSColor(color)
      this._colorCache.set(color, cachedColor)
    }
    return cachedColor
  }

  /**
   * Upload all rect instances for this frame.
   * Sub-pixel culling: rects narrower than 0.5 CSS pixel or shorter than
   * 0.5 CSS pixel are invisible and skipped before upload — reduces GPU work
   * at high zoom-out where volume / histogram bars collapse to nothing.
   * Dirty-flag: skips the GPU upload when the culled batch is identical to
   * the previous frame.
   */
  setData (rects: RectInstanceData[]): void {
    // Sub-pixel culling pass — compact visible rects into the reused buffer
    const culledBuf = this._culledBuf
    let culledCount = 0
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i]
      if (r.width < 0.5 || r.height < 0.5) continue
      if (culledCount >= culledBuf.length) culledBuf.push(r)
      else culledBuf[culledCount] = r
      culledCount++
    }
    const rectCount = culledCount
    this._rectCount = rectCount
    if (rectCount === 0) {
      if (this._fingerprintRectCount !== 0) this._vboVersion++   // canvas must be cleared
      this._fingerprintRectCount = 0
      return
    }

    // O(1) fingerprint — first/last rect corners detect pan + zoom + new-tick
    const firstRect = culledBuf[0]
    const lastRect  = culledBuf[culledCount - 1]
    if (
      rectCount      === this._fingerprintRectCount &&
      firstRect.x    === this._fingerprintFirstX    &&
      firstRect.y    === this._fingerprintFirstY    &&
      lastRect.x     === this._fingerprintLastX     &&
      lastRect.y     === this._fingerprintLastY
    ) return

    this._fingerprintRectCount = rectCount
    this._fingerprintFirstX = firstRect.x
    this._fingerprintFirstY = firstRect.y
    this._fingerprintLastX = lastRect.x
    this._fingerprintLastY = lastRect.y

    this._ensureCapacity(rectCount)

    const f32 = this._stagingF32
    const u8  = this._stagingU8
    for (let i = 0; i < rectCount; i++) {
      const rect     = culledBuf[i]
      const f32Base  = i * 4          // 4 float32 fields per rect
      const byteBase = i * BYTES_PER_RECT
      f32[f32Base + 0] = rect.x
      f32[f32Base + 1] = rect.y
      f32[f32Base + 2] = rect.width
      f32[f32Base + 3] = rect.height
      const rgba = this._parseColorCached(rect.color)
      u8[byteBase + COLOR_BYTE_OFF]     = (rgba[0] * 255 + 0.5) | 0
      u8[byteBase + COLOR_BYTE_OFF + 1] = (rgba[1] * 255 + 0.5) | 0
      u8[byteBase + COLOR_BYTE_OFF + 2] = (rgba[2] * 255 + 0.5) | 0
      u8[byteBase + COLOR_BYTE_OFF + 3] = (rgba[3] * 255 + 0.5) | 0
    }

    const gl = this._gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._stagingU8, 0, rectCount * BYTES_PER_RECT)
    this._vboVersion++   // VBO updated — draw() must re-render
  }

  /**
   * Draw all uploaded rects in a single instanced draw call.
   */
  draw (): void {
    const gl = this._gl
    const pr = getPixelRatio(this._canvas)
    const w  = this._canvas.width
    const h  = this._canvas.height

    // Incremental dirty: skip the GL pipeline when the canvas is already current.
    if (this._vboVersion === this._drawnVersion) return
    this._drawnVersion = this._vboVersion

    gl.viewport(0, 0, w, h)
    gl.scissor(0, 0, w, h)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    if (this._rectCount === 0) return

    gl.useProgram(this._program)
    gl.uniform2f(this._uResolution, w, h)
    gl.uniform1f(this._uPixelRatio, pr)

    gl.bindVertexArray(this._vao)
    gl.drawArraysInstanced(gl.TRIANGLES, 0, VERTS_PER_RECT, this._rectCount)
    gl.bindVertexArray(null)
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  destroy (): void {
    const gl = this._gl
    gl.deleteVertexArray(this._vao)
    gl.deleteBuffer(this._vbo)
    gl.deleteProgram(this._program)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    this._canvas.remove()
  }
}

const _rectRendererCache = new WeakMap<object, IndicatorRectWebGLRenderer>()

export function getRectRenderer (widgetKey: object): IndicatorRectWebGLRenderer | null {
  return _rectRendererCache.get(widgetKey) ?? null
}

export function getOrCreateRectRenderer (
  widgetKey: object,
  container: HTMLElement
): IndicatorRectWebGLRenderer | null {
  if (!WebGLCanvas.isSupported()) return null
  let r = _rectRendererCache.get(widgetKey)
  if (r === undefined) {
    try {
      r = new IndicatorRectWebGLRenderer(container)
      _rectRendererCache.set(widgetKey, r)
    } catch {
      return null
    }
  }
  return r
}

export function destroyRectRenderer (widgetKey: object): void {
  const r = _rectRendererCache.get(widgetKey)
  if (r !== undefined) {
    r.destroy()
    _rectRendererCache.delete(widgetKey)
  }
}

// ---------------------------------------------------------------------------
// Guard: can this rect instance be rendered on GPU?
// GPU path: solid fill, plain string color, no borderRadius, no border.
// Everything else falls back to Canvas2D (transparent, gradient, rounded, etc.)
// ---------------------------------------------------------------------------
export function isGpuRectEligible (styles: {
  style?: string
  color?: unknown
  borderRadius?: unknown
  borderSize?: number
  borderColor?: string
}): styles is { style: 'fill' | undefined; color: string } {
  const { style, color, borderRadius, borderSize, borderColor } = styles
  if (style !== undefined && style !== 'fill') return false
  if (typeof color !== 'string') return false       // CanvasGradient
  if (color === 'transparent' || color === '') return false
  if (borderRadius !== undefined && borderRadius !== 0) return false
  if (borderSize !== undefined && borderSize > 0 &&
      typeof borderColor === 'string' && borderColor !== 'transparent') return false
  return true
}
