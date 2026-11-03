import { getPixelRatio } from './utils/canvas'
import { type SharedIndicatorGLCanvas } from './SharedIndicatorGLCanvas'
import { type InstanceStaging, RECT_BYTES, RECT_COLOR_OFFSET } from './instancePacking'

// ---------------------------------------------------------------------------
// GPU rect renderer for histogram-style indicator figures (volume, MACD,
// custom bars). Replaces one Canvas2D fillRect per visible bar with a single
// instanced draw call.
//
// The view packs rects into an InstanceStaging (see instancePacking.ts) and
// hands it to upload() once per frame. The staging's hash decides whether the
// GPU buffer is rewritten, so redraws that keep the data cost no upload.
//
// Only solid fills take this path; see isGpuRectEligible.
// ---------------------------------------------------------------------------

const VERTS_PER_RECT = 6    // two triangles, no index buffer

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
  const vert = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC)
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

export class IndicatorRectWebGLRenderer {
  private readonly _sharedCanvas: SharedIndicatorGLCanvas
  private readonly _gl: WebGL2RenderingContext
  private readonly _program: WebGLProgram
  private readonly _vao: WebGLVertexArrayObject
  private readonly _vbo: WebGLBuffer
  private readonly _uResolution: WebGLUniformLocation
  private readonly _uPixelRatio: WebGLUniformLocation

  private _gpuCapacity = 0
  private _uploadedCount = 0
  private _uploadedHash = -1
  private _version = 0
  private _drawnVersion = -1
  private _lastSizeVersion = -1

  constructor (sharedCanvas: SharedIndicatorGLCanvas) {
    this._sharedCanvas = sharedCanvas
    const gl = sharedCanvas.gl
    this._gl = gl

    // BLEND, DEPTH_TEST and SCISSOR_TEST are set once by SharedIndicatorGLCanvas.
    this._program = createProgram(gl)
    gl.useProgram(this._program)
    this._uResolution = gl.getUniformLocation(this._program, 'u_resolution')!
    this._uPixelRatio = gl.getUniformLocation(this._program, 'u_pixelRatio')!

    this._vao = gl.createVertexArray()!
    gl.bindVertexArray(this._vao)
    this._vbo = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo)
    const bindF32 = (name: string, byteOffset: number): void => {
      const loc = gl.getAttribLocation(this._program, name)
      if (loc < 0) return
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, 1, gl.FLOAT, false, RECT_BYTES, byteOffset)
      gl.vertexAttribDivisor(loc, 1)
    }
    bindF32('a_x', 0)
    bindF32('a_y', 4)
    bindF32('a_width', 8)
    bindF32('a_height', 12)
    const colorLoc = gl.getAttribLocation(this._program, 'a_color')
    if (colorLoc >= 0) {
      gl.enableVertexAttribArray(colorLoc)
      gl.vertexAttribPointer(colorLoc, 4, gl.UNSIGNED_BYTE, true, RECT_BYTES, RECT_COLOR_OFFSET)
      gl.vertexAttribDivisor(colorLoc, 1)
    }
    gl.bindVertexArray(null)
  }

  /** Upload this frame's rects (packed with packRect) when they differ from the GPU's. */
  upload (staging: InstanceStaging): void {
    const { count, hash } = staging
    if (count === this._uploadedCount && hash === this._uploadedHash) return
    this._uploadedCount = count
    this._uploadedHash = hash
    this._version++
    if (count === 0) return
    const gl = this._gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo)
    if (count > this._gpuCapacity) {
      this._gpuCapacity = staging.capacity
      gl.bufferData(gl.ARRAY_BUFFER, this._gpuCapacity * RECT_BYTES, gl.DYNAMIC_DRAW)
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, staging.bytes())
  }

  /** True when the rect layer must be redrawn: new data, or the canvas was resized. */
  isDirty (): boolean {
    return this._version !== this._drawnVersion ||
      this._lastSizeVersion !== this._sharedCanvas.sizeVersion
  }

  resize (width: number, height: number): void {
    this._sharedCanvas.resize(width, height)
  }

  /** Draw the rects. The caller clears the canvas with beginFrame() first. */
  draw (): void {
    this._drawnVersion = this._version
    this._lastSizeVersion = this._sharedCanvas.sizeVersion
    if (this._uploadedCount === 0) return
    const canvas = this._sharedCanvas.canvas
    const gl = this._gl
    gl.useProgram(this._program)
    gl.uniform2f(this._uResolution, canvas.width, canvas.height)
    gl.uniform1f(this._uPixelRatio, getPixelRatio(canvas))
    gl.bindVertexArray(this._vao)
    gl.drawArraysInstanced(gl.TRIANGLES, 0, VERTS_PER_RECT, this._uploadedCount)
    gl.bindVertexArray(null)
  }

  destroy (): void {
    const gl = this._gl
    gl.deleteVertexArray(this._vao)
    gl.deleteBuffer(this._vbo)
    gl.deleteProgram(this._program)
    // The context and canvas belong to SharedIndicatorGLCanvas.
  }
}

const _rectRendererCache = new WeakMap<object, IndicatorRectWebGLRenderer>()

export function getRectRenderer (widgetKey: object): IndicatorRectWebGLRenderer | null {
  return _rectRendererCache.get(widgetKey) ?? null
}

export function getOrCreateRectRenderer (
  widgetKey: object,
  sharedCanvas: SharedIndicatorGLCanvas
): IndicatorRectWebGLRenderer {
  let r = _rectRendererCache.get(widgetKey)
  if (r === undefined) {
    r = new IndicatorRectWebGLRenderer(sharedCanvas)
    _rectRendererCache.set(widgetKey, r)
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

/**
 * Can this rect be drawn on the GPU? Only a plain solid fill: the rect figure
 * strokes a border for 'stroke' and 'stroke_fill' styles, never for 'fill',
 * so a border size on a fill rect is ignored here as the figure ignores it.
 */
export function isGpuRectEligible (styles: {
  style?: string
  color?: unknown
  borderRadius?: unknown
}): styles is { style: 'fill' | undefined, color: string } {
  const { style, color, borderRadius } = styles
  if (style !== undefined && style !== 'fill') return false
  if (typeof color !== 'string') return false       // CanvasGradient
  if (color === 'transparent' || color === '') return false
  if (borderRadius !== undefined && borderRadius !== 0) return false
  return true
}
