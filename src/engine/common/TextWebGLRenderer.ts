/**
 * TextWebGLRenderer — GPU-accelerated text renderer using a pre-built glyph atlas.
 *
 * Architecture
 * ────────────
 * Each DrawWidget creates one TextWebGLRenderer which owns a dedicated <canvas>
 * element at CSS z-index 3 (above the Canvas2D main/overlay layers at z-index 2).
 * Text is queued during view draw phases and flushed to the GPU in a single
 * instanced draw call.
 *
 * Frame lifecycle (two-phase)
 * ──────────────────────────
 * • beginMainFrame()   → clear BOTH queues, set phase = 'main'
 * • queue(item)        → push into _mainItems
 * • flush()            → clear GL canvas, draw _mainItems
 *
 * • beginOverlayFrame() → clear only _overlayItems, set phase = 'overlay'
 * • queue(item)         → push into _overlayItems
 * • flush()             → clear GL canvas, draw _mainItems + _overlayItems
 *
 * When only the overlay redraws (e.g. crosshair moves) _mainItems from the
 * previous main draw are preserved and re-submitted to keep axis labels visible.
 *
 * Instanced VBO layout (12 floats per glyph quad)
 * ────────────────────────────────────────────────
 * [x, y, w, h,  u0, v0, u1, v1,  r, g, b, a]
 */

import { WebGLCanvas } from './WebGLCanvas'
import { GlyphAtlas } from './GlyphAtlas'
import { getPixelRatio } from './utils/canvas'

// ── Vertex shader (WebGL2 / GLSL ES 300) ─────────────────────────────────────
const VERT_SRC = `#version 300 es
in vec2 a_corner;
in vec4 a_rect;
in vec4 a_uv;
in vec4 a_color;
uniform vec2 u_res;
out vec2 v_uv;
out vec4 v_color;
void main() {
  float px = a_rect.x + a_corner.x * a_rect.z;
  float py = a_rect.y + a_corner.y * a_rect.w;
  v_uv    = vec2(a_uv.x + a_corner.x * (a_uv.z - a_uv.x),
                 a_uv.y + a_corner.y * (a_uv.w - a_uv.y));
  v_color = a_color;
  gl_Position = vec4(px / u_res.x * 2.0 - 1.0,
                     1.0 - py / u_res.y * 2.0, 0.0, 1.0);
}`

// ── Fragment shader ───────────────────────────────────────────────────────────
const FRAG_SRC = `#version 300 es
precision mediump float;
uniform sampler2D u_atlas;
in vec2 v_uv;
in vec4 v_color;
out vec4 fragColor;
void main() {
  float a  = texture(u_atlas, v_uv).a;
  fragColor = vec4(v_color.rgb, v_color.a * a);
}`

// ── Public API ────────────────────────────────────────────────────────────────

/** A single text draw request passed to {@link TextWebGLRenderer.queue}. */
export interface TextItem {
  /** The string to render (multi-char strings are laid out glyph-by-glyph). */
  text: string
  /** X position in CSS pixels (semantic meaning depends on `align`). */
  x: number
  /** Y position in CSS pixels (semantic meaning depends on `baseline`). */
  y: number
  /** CSS font size in pixels. */
  fontSize: number
  /** CSS font family (must match an atlas key; a new atlas is built if needed). */
  fontFamily: string
  /** CSS colour string (#rrggbb, #rgba, rgb(), rgba()). */
  color: string
  /** Text horizontal alignment, same semantics as Canvas2D. Default: 'left'. */
  align?: CanvasTextAlign
  /** Text vertical baseline, same semantics as Canvas2D. Default: 'top'. */
  baseline?: CanvasTextBaseline
  /** Left padding added to x before positioning. */
  paddingLeft?: number
  /** Top padding added to y before positioning. */
  paddingTop?: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse a CSS colour string to [r, g, b, a] in the 0–1 range. */
function parseCssColor (color: string): [number, number, number, number] {
  // #rrggbb or #rrggbbaa
  let m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i.exec(color)
  if (m !== null) {
    return [
      parseInt(m[1], 16) / 255,
      parseInt(m[2], 16) / 255,
      parseInt(m[3], 16) / 255,
      m[4] !== undefined ? parseInt(m[4], 16) / 255 : 1
    ]
  }
  // rgb() / rgba()
  m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/.exec(color)
  if (m !== null) {
    return [
      parseFloat(m[1]) / 255,
      parseFloat(m[2]) / 255,
      parseFloat(m[3]) / 255,
      m[4] !== undefined ? parseFloat(m[4]) : 1
    ]
  }
  return [1, 1, 1, 1] // fallback: white
}

// ── Renderer ──────────────────────────────────────────────────────────────────

/** Floats per glyph instance in the instanced VBO. */
const FLOATS_PER = 12
/** Maximum number of glyphs batched in a single flush. */
const MAX_GLYPHS = 8192

export class TextWebGLRenderer {
  private readonly _canvas: HTMLCanvasElement
  private readonly _gl: WebGL2RenderingContext

  // WebGL objects
  private readonly _program: WebGLProgram
  private readonly _vao: WebGLVertexArrayObject
  private readonly _cornerVbo: WebGLBuffer
  private readonly _instanceVbo: WebGLBuffer

  // Uniform / attribute locations
  private readonly _uRes: WebGLUniformLocation
  private readonly _uAtlas: WebGLUniformLocation
  private readonly _aCorner: number
  private readonly _aRect: number
  private readonly _aUv: number
  private readonly _aColor: number

  // Per-frame text queues (main items persist across overlay frames)
  private _mainItems: TextItem[] = []
  private _overlayItems: TextItem[] = []
  private _phase: 'main' | 'overlay' = 'main'

  // Canvas dimensions in CSS pixels
  private _cssW = 0
  private _cssH = 0

  // Pre-allocated instance data buffer
  private readonly _buf = new Float32Array(MAX_GLYPHS * FLOATS_PER)

  // Per-renderer atlas cache keyed by "${fontSize}/${fontFamily}"
  private readonly _atlases = new Map<string, GlyphAtlas>()

  constructor (container: HTMLElement) {
    this._canvas = document.createElement('canvas')
    this._canvas.style.cssText =
      'position:absolute;top:0;left:0;pointer-events:none;z-index:3;box-sizing:border-box;'
    container.appendChild(this._canvas)

    const gl = this._canvas.getContext('webgl2', {
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance'
    })!
    this._gl = gl

    // Compile shaders and link program
    this._program = this._compileProgram()

    // Cache locations
    this._uRes   = gl.getUniformLocation(this._program, 'u_res')!
    this._uAtlas = gl.getUniformLocation(this._program, 'u_atlas')!
    this._aCorner = gl.getAttribLocation(this._program, 'a_corner')
    this._aRect   = gl.getAttribLocation(this._program, 'a_rect')
    this._aUv     = gl.getAttribLocation(this._program, 'a_uv')
    this._aColor  = gl.getAttribLocation(this._program, 'a_color')

    // Build VAO
    this._vao = gl.createVertexArray()!
    gl.bindVertexArray(this._vao)

    // Static corner VBO: TL(0,0) TR(1,0) BL(0,1) BR(1,1) — triangle strip
    this._cornerVbo = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this._cornerVbo)
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(this._aCorner)
    gl.vertexAttribPointer(this._aCorner, 2, gl.FLOAT, false, 0, 0)
    // divisor 0 → per-vertex (cycles through 4 corners each instance)

    // Dynamic instance VBO: pre-allocate, filled per frame
    this._instanceVbo = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this._instanceVbo)
    gl.bufferData(gl.ARRAY_BUFFER, this._buf, gl.DYNAMIC_DRAW)

    const stride = FLOATS_PER * 4 // bytes
    // a_rect  @ offset  0
    gl.enableVertexAttribArray(this._aRect)
    gl.vertexAttribPointer(this._aRect, 4, gl.FLOAT, false, stride, 0)
    gl.vertexAttribDivisor(this._aRect, 1)
    // a_uv    @ offset 16
    gl.enableVertexAttribArray(this._aUv)
    gl.vertexAttribPointer(this._aUv, 4, gl.FLOAT, false, stride, 16)
    gl.vertexAttribDivisor(this._aUv, 1)
    // a_color @ offset 32
    gl.enableVertexAttribArray(this._aColor)
    gl.vertexAttribPointer(this._aColor, 4, gl.FLOAT, false, stride, 32)
    gl.vertexAttribDivisor(this._aColor, 1)

    gl.bindVertexArray(null)

    // One-time GL state
    gl.disable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  }

  // ── Frame lifecycle ─────────────────────────────────────────────────────────

  /** Call before the main (non-overlay) canvas draws. Clears all queued text. */
  beginMainFrame (): void {
    this._phase = 'main'
    this._mainItems = []
    this._overlayItems = []
  }

  /** Call before the overlay canvas draws. Keeps main items, clears overlay. */
  beginOverlayFrame (): void {
    this._phase = 'overlay'
    this._overlayItems = []
  }

  /** Enqueue one text draw call for the current phase. */
  queue (item: TextItem): void {
    if (this._phase === 'main') {
      this._mainItems.push(item)
    } else {
      this._overlayItems.push(item)
    }
  }

  /**
   * Render all queued text to the GL canvas in a single instanced draw call
   * per atlas texture. Clears the canvas first so stale text from a previous
   * phase is removed before re-compositing main + overlay items.
   */
  flush (): void {
    const gl = this._gl
    if (this._cssW === 0 || this._cssH === 0) return

    gl.viewport(0, 0, this._canvas.width, this._canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    const allItems = this._mainItems.concat(this._overlayItems)
    if (allItems.length === 0) return

    gl.useProgram(this._program)
    gl.uniform2f(this._uRes, this._cssW, this._cssH)
    gl.uniform1i(this._uAtlas, 0)
    gl.bindVertexArray(this._vao)
    gl.activeTexture(gl.TEXTURE0)

    // Group items by atlas so we minimise texture binds.
    // In practice all tick labels share the same (fontSize, fontFamily) → 1 bind.
    type AtlasGroup = { atlas: GlyphAtlas; items: TextItem[] }
    const groups = new Map<string, AtlasGroup>()
    for (const item of allItems) {
      const key = `${item.fontSize}/${item.fontFamily}`
      let g = groups.get(key)
      if (g === undefined) {
        g = { atlas: this._getAtlas(item.fontSize, item.fontFamily), items: [] }
        groups.set(key, g)
      }
      g.items.push(item)
    }

    for (const { atlas, items } of groups.values()) {
      if (atlas.texture === null) continue
      const glyphCount = this._packInstances(atlas, items)
      if (glyphCount === 0) continue

      gl.bindTexture(gl.TEXTURE_2D, atlas.texture)
      gl.bindBuffer(gl.ARRAY_BUFFER, this._instanceVbo)
      gl.bufferSubData(gl.ARRAY_BUFFER, 0,
        this._buf.subarray(0, glyphCount * FLOATS_PER))
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, glyphCount)
    }

    gl.bindVertexArray(null)
  }

  // ── Geometry packing ────────────────────────────────────────────────────────

  /**
   * Lay out each TextItem character-by-character and write glyph quads into
   * `_buf`. Returns the total number of glyph instances written.
   */
  private _packInstances (atlas: GlyphAtlas, items: TextItem[]): number {
    const buf = this._buf
    let idx = 0

    for (const item of items) {
      const scale = item.fontSize / atlas.fontSize
      const cellH = atlas.getGlyph('0')?.cellH ?? item.fontSize
      const glyphH = cellH * scale

      const pl = item.paddingLeft ?? 0
      const pt = item.paddingTop ?? 0
      const [r, g, b, a] = parseCssColor(item.color)

      // Compute total text width for alignment.
      let totalW = 0
      for (const ch of item.text) {
        const glyph = atlas.getGlyph(ch)
        totalW += (glyph !== null ? glyph.advance : item.fontSize * 0.5) * scale
      }

      const align = item.align ?? 'left'
      let startX: number
      if (align === 'right' || align === 'end') {
        startX = item.x - totalW + pl
      } else if (align === 'center') {
        startX = item.x - totalW / 2 + pl
      } else {
        startX = item.x + pl
      }

      const baseline = item.baseline ?? 'top'
      let startY: number
      if (baseline === 'bottom' || baseline === 'alphabetic' ||
          baseline === 'ideographic') {
        startY = item.y - glyphH + pt
      } else if (baseline === 'middle') {
        startY = item.y - glyphH / 2 + pt
      } else {
        startY = item.y + pt
      }

      let curX = startX
      for (const ch of item.text) {
        if (idx >= MAX_GLYPHS) break
        const glyph = atlas.getGlyph(ch)
        if (glyph === null) {
          curX += item.fontSize * 0.5 * scale
          continue
        }
        const glyphW = glyph.cellW * scale
        const base = idx * FLOATS_PER
        // a_rect
        buf[base]     = curX
        buf[base + 1] = startY
        buf[base + 2] = glyphW
        buf[base + 3] = glyphH
        // a_uv
        buf[base + 4] = glyph.u0
        buf[base + 5] = glyph.v0
        buf[base + 6] = glyph.u1
        buf[base + 7] = glyph.v1
        // a_color
        buf[base + 8]  = r
        buf[base + 9]  = g
        buf[base + 10] = b
        buf[base + 11] = a

        curX += glyph.advance * scale
        idx++
      }
    }
    return idx
  }

  // ── Atlas management ────────────────────────────────────────────────────────

  private _getAtlas (fontSize: number, fontFamily: string): GlyphAtlas {
    const key = `${fontSize}/${fontFamily}`
    let atlas = this._atlases.get(key)
    if (atlas === undefined) {
      atlas = new GlyphAtlas(fontSize, fontFamily)
      atlas.build(this._gl)
      this._atlases.set(key, atlas)
    }
    return atlas
  }

  // ── Sizing ──────────────────────────────────────────────────────────────────

  resize (width: number, height: number): void {
    if (this._cssW === width && this._cssH === height) return
    this._cssW = width
    this._cssH = height
    const pr = getPixelRatio(this._canvas)
    this._canvas.width = Math.round(width * pr)
    this._canvas.height = Math.round(height * pr)
    this._canvas.style.width  = `${width}px`
    this._canvas.style.height = `${height}px`
    this._gl.viewport(0, 0, this._canvas.width, this._canvas.height)
  }

  // ── Accessors ───────────────────────────────────────────────────────────────

  getElement (): HTMLCanvasElement { return this._canvas }

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  destroy (): void {
    const gl = this._gl
    for (const atlas of this._atlases.values()) {
      atlas.destroy(gl)
    }
    this._atlases.clear()
    gl.deleteBuffer(this._cornerVbo)
    gl.deleteBuffer(this._instanceVbo)
    gl.deleteVertexArray(this._vao)
    gl.deleteProgram(this._program)
    const ext = gl.getExtension('WEBGL_lose_context')
    ext?.loseContext()
    this._canvas.remove()
  }

  // ── Static ──────────────────────────────────────────────────────────────────

  /** Returns true when WebGL2 is available (required by TextWebGLRenderer). */
  static isSupported (): boolean {
    return WebGLCanvas.isSupported()
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private _compileProgram (): WebGLProgram {
    const gl = this._gl
    const vs = gl.createShader(gl.VERTEX_SHADER)!
    gl.shaderSource(vs, VERT_SRC)
    gl.compileShader(vs)

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!
    gl.shaderSource(fs, FRAG_SRC)
    gl.compileShader(fs)

    const prog = gl.createProgram()!
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    return prog
  }
}
