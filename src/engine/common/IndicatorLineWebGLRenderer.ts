import { getPixelRatio } from './utils/canvas'
import type { SharedIndicatorGLCanvas } from './SharedIndicatorGLCanvas'
import { type InstanceStaging, SEGMENT_BYTES, SEGMENT_COLOR_OFFSET } from './instancePacking'

// ---------------------------------------------------------------------------
// GPU line renderer for indicator figure lines and grid lines.
//
// Instanced rendering: one instance per line segment. The vertex shader expands
// each (x0,y0)→(x1,y1) segment into a screen-aligned quad (two triangles via
// gl_VertexID) and the fragment shader anti-aliases the edge, so lines look the
// same at any width, unlike Canvas2D polylines which alias at fractional widths.
//
// The view packs segments into an InstanceStaging (see instancePacking.ts) and
// hands it to upload() once per frame. The staging's hash decides whether the
// GPU buffer is rewritten, so redraws that keep the data cost no upload. Grid
// lines have their own buffer: they change on zoom and resize but not on pan.
// ---------------------------------------------------------------------------

const VERTS_PER_SEG = 6   // two triangles, no index buffer

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
out float v_dist;        // signed distance from the centreline, physical pixels
out float v_halfWidth;   // half the line width, physical pixels

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

  // Extrude one extra pixel each side so the anti-aliased edge has room; the
  // fragment shader fades that margin out by pixel coverage.
  float halfWidth = a_halfWidth * u_pixelRatio;
  float extent = halfWidth + 1.0;
  vec2 pos = mix(p0, p1, t) + normal * (n * extent);

  // Physical px → NDC (Y-flip: CSS Y=0 is top, NDC Y=+1 is top)
  gl_Position = vec4(
    (pos.x / u_resolution.x) * 2.0 - 1.0,
    1.0 - (pos.y / u_resolution.y) * 2.0,
    0.0, 1.0
  );

  v_color     = a_color;
  v_dist      = n * extent;
  v_halfWidth = halfWidth;
}
`

const FRAG_SRC = /* glsl */`#version 300 es
precision mediump float;
in  vec4  v_color;
in  float v_dist;
in  float v_halfWidth;
out vec4  fragColor;
void main() {
  // Alpha is the share of this pixel the line covers: full inside the line,
  // fading over one pixel at the edge. A 1px line keeps its full colour at the
  // centre, as it does on Canvas2D, instead of being faded by a derivative-width
  // smoothstep that treats thin lines as all edge.
  float coverage = clamp(v_halfWidth + 0.5 - abs(v_dist), 0.0, 1.0);
  fragColor = vec4(v_color.rgb, v_color.a * coverage);
}
`

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
  const vert = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC)
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

/** One instance buffer on the GPU, and what was last uploaded to it. */
class SegmentBuffer {
  readonly vao: WebGLVertexArrayObject
  readonly vbo: WebGLBuffer
  gpuCapacity = 0
  uploadedCount = 0
  uploadedHash = -1
  version = 0
  drawnVersion = -1

  constructor (gl: WebGL2RenderingContext, program: WebGLProgram) {
    this.vao = gl.createVertexArray()!
    gl.bindVertexArray(this.vao)
    this.vbo = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo)
    const bindF32 = (name: string, byteOffset: number): void => {
      const loc = gl.getAttribLocation(program, name)
      if (loc < 0) return
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, 1, gl.FLOAT, false, SEGMENT_BYTES, byteOffset)
      gl.vertexAttribDivisor(loc, 1)
    }
    bindF32('a_x0', 0)
    bindF32('a_y0', 4)
    bindF32('a_x1', 8)
    bindF32('a_y1', 12)
    bindF32('a_halfWidth', 16)
    const colorLoc = gl.getAttribLocation(program, 'a_color')
    if (colorLoc >= 0) {
      gl.enableVertexAttribArray(colorLoc)
      gl.vertexAttribPointer(colorLoc, 4, gl.UNSIGNED_BYTE, true, SEGMENT_BYTES, SEGMENT_COLOR_OFFSET)
      gl.vertexAttribDivisor(colorLoc, 1)
    }
    gl.bindVertexArray(null)
  }

  /** Rewrite the GPU buffer when the staged segments differ from what it holds. */
  upload (gl: WebGL2RenderingContext, staging: InstanceStaging): void {
    const { count, hash } = staging
    if (count === this.uploadedCount && hash === this.uploadedHash) return
    this.uploadedCount = count
    this.uploadedHash = hash
    this.version++
    if (count === 0) return
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo)
    if (count > this.gpuCapacity) {
      this.gpuCapacity = staging.capacity
      gl.bufferData(gl.ARRAY_BUFFER, this.gpuCapacity * SEGMENT_BYTES, gl.DYNAMIC_DRAW)
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, staging.bytes())
  }

  destroy (gl: WebGL2RenderingContext): void {
    gl.deleteVertexArray(this.vao)
    gl.deleteBuffer(this.vbo)
  }
}

export class IndicatorLineWebGLRenderer {
  private readonly _sharedCanvas: SharedIndicatorGLCanvas
  private readonly _gl: WebGL2RenderingContext
  private readonly _program: WebGLProgram
  private readonly _uResolution: WebGLUniformLocation
  private readonly _uPixelRatio: WebGLUniformLocation

  private readonly _lines: SegmentBuffer
  private readonly _grid: SegmentBuffer
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

    this._lines = new SegmentBuffer(gl, this._program)
    this._grid = new SegmentBuffer(gl, this._program)
  }

  /** Upload this frame's indicator line segments (packed with packSegment). */
  upload (staging: InstanceStaging): void { this._lines.upload(this._gl, staging) }

  /** Upload this frame's grid line segments (packed with packSegment). */
  uploadGrid (staging: InstanceStaging): void { this._grid.upload(this._gl, staging) }

  /** True when the line layer must be redrawn: new data, or the canvas was resized. */
  isDirty (): boolean {
    return this._lines.version !== this._lines.drawnVersion ||
      this._lastSizeVersion !== this._sharedCanvas.sizeVersion
  }

  isGridDirty (): boolean {
    return this._grid.version !== this._grid.drawnVersion ||
      this._lastSizeVersion !== this._sharedCanvas.sizeVersion
  }

  resize (width: number, height: number): void {
    this._sharedCanvas.resize(width, height)
  }

  /** Draw the indicator lines. The caller clears the canvas with beginFrame() first. */
  draw (): void {
    this._lines.drawnVersion = this._lines.version
    this._lastSizeVersion = this._sharedCanvas.sizeVersion
    this._drawBuffer(this._lines)
  }

  /** Draw the grid lines; call before draw() so the grid sits behind the lines. */
  drawGrid (): void {
    this._grid.drawnVersion = this._grid.version
    this._lastSizeVersion = this._sharedCanvas.sizeVersion
    this._drawBuffer(this._grid)
  }

  private _drawBuffer (buffer: SegmentBuffer): void {
    if (buffer.uploadedCount === 0) return
    const canvas = this._sharedCanvas.canvas
    const gl = this._gl
    gl.useProgram(this._program)
    gl.uniform2f(this._uResolution, canvas.width, canvas.height)
    gl.uniform1f(this._uPixelRatio, getPixelRatio(canvas))
    gl.bindVertexArray(buffer.vao)
    gl.drawArraysInstanced(gl.TRIANGLES, 0, VERTS_PER_SEG, buffer.uploadedCount)
    gl.bindVertexArray(null)
  }

  destroy (): void {
    const gl = this._gl
    this._grid.destroy(gl)
    this._lines.destroy(gl)
    gl.deleteProgram(this._program)
    // The context and canvas belong to SharedIndicatorGLCanvas.
  }
}

// One renderer per pane widget.
const _lineRendererCache = new WeakMap<object, IndicatorLineWebGLRenderer>()

export function getLineRenderer (widgetKey: object): IndicatorLineWebGLRenderer | null {
  return _lineRendererCache.get(widgetKey) ?? null
}

export function getOrCreateLineRenderer (
  widgetKey: object,
  sharedCanvas: SharedIndicatorGLCanvas
): IndicatorLineWebGLRenderer {
  let r = _lineRendererCache.get(widgetKey)
  if (r === undefined) {
    r = new IndicatorLineWebGLRenderer(sharedCanvas)
    _lineRendererCache.set(widgetKey, r)
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

export { getOrCreateSharedIndicatorGLCanvas, getSharedIndicatorGLCanvas } from './SharedIndicatorGLCanvas'
