import { getPixelRatio } from './utils/canvas'

// ---------------------------------------------------------------------------
// GPU line renderer for indicator figure lines (Priority 3).
//
// Uses instanced rendering: 1 draw-call instance = 1 line segment.
// The vertex shader expands each (x0,y0)→(x1,y1) segment into a screen-aligned
// quad (2 triangles, 6 verts via gl_VertexID) giving sub-pixel smooth lines
// at any line-width — unlike Canvas2D polylines which alias at fractional widths.
//
// Memory layout — packed per-instance VBO  (24 bytes / segment)
//
//  Byte  0– 3  Float32  x0          (CSS pixels)
//  Byte  4– 7  Float32  y0          (CSS pixels)
//  Byte  8–11  Float32  x1          (CSS pixels)
//  Byte 12–15  Float32  y1          (CSS pixels)
//  Byte 16–19  Float32  halfWidth   (CSS pixels — shader scales by pixelRatio)
//  Byte 20–23  UByte×4  RGBA        (normalized: 0..255 → 0..1 in shader)
//
// Coordinate system: CSS pixels, Y=0 at top of canvas (matching Canvas2D).
// Shader converts: CSS px → physical px → NDC (with Y-flip).
// ---------------------------------------------------------------------------

const BYTES_PER_SEG = 24
const COLOR_BYTE_OFF = 20   // byte offset of the colour field per segment
const VERTS_PER_SEG  = 6   // two triangles, no index buffer

// ---------------------------------------------------------------------------
// Vertex shader — quad expansion via gl_VertexID
// ---------------------------------------------------------------------------
const VERT_SRC = /* glsl */`#version 300 es
precision highp float;

// Per-segment attributes (divisor = 1)
in float a_x0;
in float a_y0;
in float a_x1;
in float a_y1;
in float a_halfWidth;   // CSS pixels
in vec4  a_color;       // RGBA, normalized

// Canvas dimensions in physical pixels; devicePixelRatio
uniform vec2  u_resolution;
uniform float u_pixelRatio;

out vec4  v_color;
out float v_normDist;   // signed normalised perp distance: ±1 at the line edges

void main() {
  // Quad-expansion pattern for 6 vertices (two triangles):
  //  vi: 0  1  2  3  4  5
  //   t: 0  1  1  0  1  0   (0 = p0 endpoint, 1 = p1 endpoint)
  //   n: -1 -1 +1 -1 +1 +1  (±normal extrusion)
  int vi = gl_VertexID % 6;
  float t = (vi == 1 || vi == 2 || vi == 4) ? 1.0 : 0.0;
  float n = (vi == 2 || vi == 4 || vi == 5) ? 1.0 : -1.0;

  // Convert endpoints to physical pixels
  vec2 p0  = vec2(a_x0, a_y0) * u_pixelRatio;
  vec2 p1  = vec2(a_x1, a_y1) * u_pixelRatio;
  vec2 dir = p1 - p0;
  float len = length(dir);
  vec2 unitDir = len > 0.001 ? dir / len : vec2(1.0, 0.0);
  vec2 normal  = vec2(-unitDir.y, unitDir.x);

  // Interpolate along segment then extrude perpendicular
  vec2 pos = mix(p0, p1, t) + normal * (n * a_halfWidth * u_pixelRatio);

  // Physical px → NDC (Y-flip: CSS Y=0 is top, NDC Y=+1 is top)
  gl_Position = vec4(
    (pos.x / u_resolution.x) * 2.0 - 1.0,
    1.0 - (pos.y / u_resolution.y) * 2.0,
    0.0, 1.0
  );

  v_color    = a_color;
  v_normDist = n;         // ±1 at the outer edges, interpolated across the quad
}
`

const FRAG_SRC = /* glsl */`#version 300 es
precision mediump float;
in  vec4  v_color;
in  float v_normDist;
out vec4  fragColor;
void main() {
  // Anti-alias the line edge over ~1 physical pixel using the built-in
  // fwidth() derivative (GLSL ES 3.0 — no extension needed).
  // abs(v_normDist) → 0 at the centreline, 1 at the hard edge.
  // smoothstep fades the alpha from 1 → 0 over one derivative-width.
  float fw = fwidth(v_normDist);
  float aa = 1.0 - smoothstep(1.0 - fw, 1.0 + fw, abs(v_normDist));
  fragColor = vec4(v_color.rgb, v_color.a * aa);
}
`

// ---------------------------------------------------------------------------
// Shader helpers
// ---------------------------------------------------------------------------

function compileShader (gl: WebGL2RenderingContext, type: GLenum, src: string): WebGLShader {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`[IndicatorLineWebGLRenderer] shader compile error: ${gl.getShaderInfoLog(shader) ?? '?'}`)
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
    throw new Error(`[IndicatorLineWebGLRenderer] program link error: ${gl.getProgramInfoLog(prog) ?? '?'}`)
  }
  return prog
}

// ---------------------------------------------------------------------------
// Colour helpers (intentionally local — avoids coupling to CandleWebGLRenderer)
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

export interface LineSegmentData {
  x0: number
  y0: number
  x1: number
  y1: number
  halfWidth: number   // CSS pixels
  color: string       // any CSS color string
}

export class IndicatorLineWebGLRenderer {
  private readonly _gl: WebGL2RenderingContext
  private readonly _canvas: HTMLCanvasElement
  private readonly _program: WebGLProgram
  private readonly _vao: WebGLVertexArrayObject
  private readonly _vbo: WebGLBuffer

  // uniform locations
  private readonly _uResolution: WebGLUniformLocation
  private readonly _uPixelRatio: WebGLUniformLocation

  private _capacity = 0
  private _segCount = 0

  // Pre-allocated staging buffer — grows with capacity, never shrinks
  private _stagingBuf: ArrayBuffer = new ArrayBuffer(512 * BYTES_PER_SEG)
  private _stagingF32: Float32Array = new Float32Array(this._stagingBuf)
  private _stagingU8:  Uint8Array   = new Uint8Array(this._stagingBuf)

  // Color cache — indicator palettes are small (≤10 distinct colors typically)
  private readonly _colorCache = new Map<string, readonly [number, number, number, number]>()

  // ---------------------------------------------------------------------------
  // Dirty-flag fingerprint (same O(1) strategy as CandleWebGLRenderer)
  // ---------------------------------------------------------------------------
  private _fingerprintSegmentCount = -1
  private _fingerprintFirstX = 0
  private _fingerprintFirstY = 0
  private _fingerprintLastX = 0
  private _fingerprintLastY = 0

  // Sub-pixel culling reuse buffer — grows amortised, never shrinks.
  // Holds the visible subset of segments after culling each frame.
  private readonly _culledBuf: LineSegmentData[] = []

  // ── Incremental dirty tracking ───────────────────────────────────────────────
  //  _vboVersion increments whenever the VBO is actually written.
  //  draw() skips the GL pipeline entirely when _drawnVersion matches.
  private _vboVersion   = 0
  private _drawnVersion = -1

  constructor (container: HTMLElement) {
    const canvas = document.createElement('canvas')
    canvas.style.position  = 'absolute'
    canvas.style.top       = '0'
    canvas.style.left      = '0'
    canvas.style.zIndex    = '1'    // below Canvas2D layer (z-index 2)
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
    if (gl === null) throw new Error('[IndicatorLineWebGLRenderer] WebGL2 unavailable')
    this._gl = gl

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

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
    const stride = BYTES_PER_SEG

    const bindF32 = (name: string, byteOffset: number): void => {
      const loc = gl.getAttribLocation(prog, name)
      if (loc < 0) return
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, 1, gl.FLOAT, false, stride, byteOffset)
      gl.vertexAttribDivisor(loc, 1)
    }

    bindF32('a_x0',        0)
    bindF32('a_y0',        4)
    bindF32('a_x1',        8)
    bindF32('a_y1',       12)
    bindF32('a_halfWidth', 16)

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
    this._stagingBuf = new ArrayBuffer(newCap * BYTES_PER_SEG)
    this._stagingF32 = new Float32Array(this._stagingBuf)
    this._stagingU8  = new Uint8Array(this._stagingBuf)
    const gl = this._gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo)
    gl.bufferData(gl.ARRAY_BUFFER, newCap * BYTES_PER_SEG, gl.DYNAMIC_DRAW)
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
   * Upload all line segments for this frame.
   * Sub-pixel culling: segments where both Δx and Δy are < 0.5 CSS pixel are
   * invisible at any scale and skipped before upload — proportionally reduces
   * GPU work at high zoom-out where many indicator segments collapse to a point.
   * Dirty-flag: skips the GPU upload when the culled segment set is identical
   * to the previous frame (e.g. crosshair hover redraws).
   */
  setData (segs: LineSegmentData[]): void {
    // Sub-pixel culling pass — compact visible segments into the reused buffer
    const culledBuf = this._culledBuf
    let culledCount = 0
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i]
      if (Math.abs(s.x1 - s.x0) < 0.5 && Math.abs(s.y1 - s.y0) < 0.5) continue
      if (culledCount >= culledBuf.length) culledBuf.push(s)
      else culledBuf[culledCount] = s
      culledCount++
    }
    const segmentCount = culledCount
    this._segCount = segmentCount
    if (segmentCount === 0) {
      if (this._fingerprintSegmentCount !== 0) this._vboVersion++   // canvas must be cleared
      this._fingerprintSegmentCount = 0
      return
    }

    // O(1) fingerprint — first/last endpoint covers pan + new-tick cases
    const firstSegment = culledBuf[0]
    const lastSegment  = culledBuf[culledCount - 1]
    if (
      segmentCount     === this._fingerprintSegmentCount &&
      firstSegment.x0  === this._fingerprintFirstX       &&
      firstSegment.y0  === this._fingerprintFirstY       &&
      lastSegment.x1   === this._fingerprintLastX        &&
      lastSegment.y1   === this._fingerprintLastY
    ) return

    this._fingerprintSegmentCount = segmentCount
    this._fingerprintFirstX = firstSegment.x0
    this._fingerprintFirstY = firstSegment.y0
    this._fingerprintLastX = lastSegment.x1
    this._fingerprintLastY = lastSegment.y1

    this._ensureCapacity(segmentCount)

    const f32 = this._stagingF32
    const u8  = this._stagingU8
    for (let i = 0; i < segmentCount; i++) {
      const seg     = culledBuf[i]
      const f32Base = i * 5          // 5 float32 fields per segment
      const byteBase = i * BYTES_PER_SEG
      f32[f32Base + 0] = seg.x0
      f32[f32Base + 1] = seg.y0
      f32[f32Base + 2] = seg.x1
      f32[f32Base + 3] = seg.y1
      f32[f32Base + 4] = seg.halfWidth
      const rgba = this._parseColorCached(seg.color)
      u8[byteBase + COLOR_BYTE_OFF]     = (rgba[0] * 255 + 0.5) | 0
      u8[byteBase + COLOR_BYTE_OFF + 1] = (rgba[1] * 255 + 0.5) | 0
      u8[byteBase + COLOR_BYTE_OFF + 2] = (rgba[2] * 255 + 0.5) | 0
      u8[byteBase + COLOR_BYTE_OFF + 3] = (rgba[3] * 255 + 0.5) | 0
    }

    const gl = this._gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._stagingU8, 0, segmentCount * BYTES_PER_SEG)
    this._vboVersion++   // VBO updated — draw() must re-render
  }

  /**
   * Draw all uploaded line segments in a single instanced draw call.
   * @param width  CSS pixel width of the pane widget
   * @param height CSS pixel height of the pane widget
   */
  draw (width: number, height: number): void {
    const gl = this._gl
    const pr = getPixelRatio(this._canvas)
    const w  = this._canvas.width
    const h  = this._canvas.height

    // Incremental dirty: skip the GL pipeline when the canvas is already current.
    if (this._vboVersion === this._drawnVersion) return
    this._drawnVersion = this._vboVersion

    gl.viewport(0, 0, w, h)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    if (this._segCount === 0) return

    gl.useProgram(this._program)
    gl.uniform2f(this._uResolution, w, h)
    gl.uniform1f(this._uPixelRatio, pr)

    gl.bindVertexArray(this._vao)
    gl.drawArraysInstanced(gl.TRIANGLES, 0, VERTS_PER_SEG, this._segCount)
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
    const ext = gl.getExtension('WEBGL_lose_context')
    ext?.loseContext()
    this._canvas.remove()
  }
}

// ---------------------------------------------------------------------------
// Module-level WebGL2 support cache (same approach as CandleWebGLRenderer —
// avoids creating throwaway contexts on every draw call).
// ---------------------------------------------------------------------------
const _lineGL2Supported: boolean = (() => {
  try {
    const c  = document.createElement('canvas')
    const gl = c.getContext('webgl2')
    if (gl === null) return false
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
})()

// WeakMap keyed on the widget instance — one renderer per pane widget
const _lineRendererCache = new WeakMap<object, IndicatorLineWebGLRenderer>()

export function getLineRenderer (widgetKey: object): IndicatorLineWebGLRenderer | null {
  return _lineRendererCache.get(widgetKey) ?? null
}

export function getOrCreateLineRenderer (
  widgetKey: object,
  container: HTMLElement
): IndicatorLineWebGLRenderer | null {
  if (!_lineGL2Supported) return null
  let r = _lineRendererCache.get(widgetKey)
  if (r === undefined) {
    try {
      r = new IndicatorLineWebGLRenderer(container)
      _lineRendererCache.set(widgetKey, r)
    } catch {
      return null
    }
  }
  return r
}

export function destroyLineRenderer (widgetKey: object): void {
  const r = _lineRendererCache.get(widgetKey)
  if (r !== undefined) {
    r.destroy()
    _lineRendererCache.delete(widgetKey)
  }
}
