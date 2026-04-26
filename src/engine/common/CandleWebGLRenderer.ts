import { getPixelRatio } from './utils/canvas'

// ---------------------------------------------------------------------------
// Minimal local type for EXT_disjoint_timer_query_webgl2 (WebGL2 variant).
// Unlike the WebGL1 EXT_disjoint_timer_query, this extension does NOT provide
// beginQueryEXT/endQueryEXT on the extension object.  Instead, the standard
// WebGL2 gl.beginQuery() / gl.endQuery() methods are used directly.
// The extension object only provides constants.
// ---------------------------------------------------------------------------
interface GPUTimerEXT {
  readonly TIME_ELAPSED_EXT: GLenum
  readonly GPU_DISJOINT_EXT: GLenum
}

// ---------------------------------------------------------------------------
// Memory layout — packed per-instance VBO  (32 bytes / bar)
//
//  Byte  0– 3  Float32    centerX     (screen X in CSS pixels)
//  Byte  4– 7  Float32    open
//  Byte  8–11  Float32    high
//  Byte 12–15  Float32    low
//  Byte 16–19  Float32    close
//  Byte 20–23  UByte×4    wickColor   (R G B A, normalized → 0..1 in shader)
//  Byte 24–27  UByte×4    bodyColor
//  Byte 28–31  UByte×4    borderColor
//
//  53 % smaller than the legacy float-only layout (17 × 4 = 68 bytes/bar)
//  → proportional reduction in GPU vertex-fetch memory bandwidth.
// ---------------------------------------------------------------------------
const BYTES_PER_BAR  = 32
const COLOR_BYTE_OFF = 20    // byte offset of first colour field per bar
const VERTS_PER_BAR  = 18    // (wick 0–5) + (body-outer 6–11) + (body-inner 12–17)

// ---------------------------------------------------------------------------
// Vertex shader
//
// 18 vertices per instance:
//   0 – 5  → wick quad    (1 px wide, full high–low range)
//   6 – 11 → body-outer   (full bar width, fill with border colour)
//  12 – 17 → body-inner   (inset 1 px on each side, fill with body colour)
//
// Phase 4.3 — GPU coordinate transform:
//   u_priceFrom / u_priceRange: map raw price → screen Y
//   u_resolution              : canvas dimensions in physical pixels
//   u_pixelRatio              : device pixel ratio (CSS px → physical px)
//   u_barHalfWidth            : half of the visible bar width (CSS pixels)
// ---------------------------------------------------------------------------
const VERT_SRC = /* glsl */ `#version 300 es
precision highp float;

// Per-instance attributes (divisor = 1)
in float a_centerX;
in float a_open;
in float a_high;
in float a_low;
in float a_close;
in vec4  a_wickColor;
in vec4  a_bodyColor;
in vec4  a_borderColor;

// Phase 4.3 — updated once per pan/zoom (O(1))
uniform float u_priceFrom;    // realFrom of the visible Y range
uniform float u_priceRange;   // realRange of the visible Y range
uniform vec2  u_resolution;   // canvas physical pixel dimensions
uniform float u_pixelRatio;   // CSS px → physical px
uniform float u_barHalfWidth; // half bar gapBar width, in CSS pixels
// Render mode: 0 = candle (solid/stroke), 1 = ohlc
uniform int   u_renderMode;
// Half of ohlcSize in CSS pixels — only used when u_renderMode == 1
uniform float u_ohlcHalfSize;
// Pan-offset optimisation (Priority 5): CSS pixel delta added to every bar's
// a_centerX in the vertex shader so that pure-pan frames skip bufferSubData.
uniform float u_panOffset;

out vec4 v_color;

// Unit-quad positions shared by all three sub-quads
vec2 unitQuad(int id) {
  if (id == 0) return vec2(0.0, 0.0);
  if (id == 1) return vec2(1.0, 0.0);
  if (id == 2) return vec2(0.0, 1.0);
  if (id == 3) return vec2(0.0, 1.0);
  if (id == 4) return vec2(1.0, 0.0);
              return vec2(1.0, 1.0);
}

// GPU price → physical screen-Y pixel  (Phase 4.3)
float priceToPhysY(float price) {
  float rate = (price - u_priceFrom) / u_priceRange;
  return (1.0 - rate) * u_resolution.y;
}

void main() {
  bool isWick      = gl_VertexID < 6;
  bool isBodyOuter = gl_VertexID >= 6  && gl_VertexID < 12;
  // isBodyInner   = gl_VertexID >= 12

  int localId = gl_VertexID < 6  ? gl_VertexID :
                gl_VertexID < 12 ? gl_VertexID - 6 :
                                   gl_VertexID - 12;
  vec2 unit = unitQuad(localId);

  float highY  = priceToPhysY(a_high);
  float lowY   = priceToPhysY(a_low);
  float openY  = priceToPhysY(a_open);
  float closeY = priceToPhysY(a_close);

  float pr   = u_pixelRatio;
  float cx   = (a_centerX + u_panOffset) * pr;  // pan-offset + CSS px → physical px
  float bhw  = u_barHalfWidth * pr;

  float screenX, screenY;

  if (u_renderMode == 1) {
    // ── OHLC mode ──────────────────────────────────────────────────────────
    // wick:       center-aligned vertical bar, width = ohlcSize
    // body-outer: open  stub (left  side: cx-bhw → cx-ohw)
    // body-inner: close stub (right side: cx+ohw → cx+bhw)
    float ohw   = u_ohlcHalfSize * pr;  // half ohlcSize in physical px
    float tickH = ohw * 2.0;            // tick height = ohlcSize

    if (isWick) {
      screenX = cx - ohw + unit.x * ohw * 2.0;
      screenY = highY + (lowY - highY) * unit.y;
      v_color = a_bodyColor;
    } else if (isBodyOuter) {
      float left  = cx - bhw;
      float right = cx - ohw;
      screenX = left  + unit.x * max(right - left, 0.0);
      screenY = openY + unit.y * tickH;
      v_color = a_bodyColor;
    } else {
      float left  = cx + ohw;
      float right = cx + bhw;
      screenX = left   + unit.x * max(right - left, 0.0);
      screenY = closeY + unit.y * tickH;
      v_color = a_bodyColor;
    }
  } else {
    // ── Candle mode (solid / stroke) ───────────────────────────────────────
    float bodyTop    = min(openY, closeY);
    float bodyBottom = max(openY, closeY);
    bodyBottom       = max(bodyBottom, bodyTop + 1.0); // min 1px body

    if (isWick) {
      screenX = cx - 0.5 + unit.x;
      screenY = highY + (lowY - highY) * unit.y;
      v_color = a_wickColor;
    } else if (isBodyOuter) {
      screenX = cx - bhw + unit.x * bhw * 2.0;
      screenY = bodyTop + (bodyBottom - bodyTop) * unit.y;
      v_color = a_borderColor;
    } else {
      // body inner — 1 physical pixel inset on each side.
      // For stroke types, bodyColor alpha = 0 → body-inner is transparent,
      // leaving only the body-outer border visible (hollow candle).
      float inset = 1.0;
      float innerHW = max(bhw - inset, 0.5);
      screenX = cx - innerHW + unit.x * innerHW * 2.0;
      float innerTop    = bodyTop + inset;
      float innerBottom = max(bodyBottom - inset, innerTop);
      screenY = innerTop + (innerBottom - innerTop) * unit.y;
      v_color = a_bodyColor;
    }

  // Physical pixel → NDC
  gl_Position = vec4(
    screenX / u_resolution.x * 2.0 - 1.0,
    1.0 - screenY / u_resolution.y * 2.0,
    0.0, 1.0
  );
}
`

const FRAG_SRC = /* glsl */ `#version 300 es
precision mediump float;
in  vec4 v_color;
out vec4 fragColor;
void main() { fragColor = v_color; }
`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function compileShader (gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const msg = gl.getShaderInfoLog(shader) ?? 'unknown'
    gl.deleteShader(shader)
    throw new Error(`[CandleWebGLRenderer] shader compile error: ${msg}`)
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
    throw new Error(`[CandleWebGLRenderer] program link error: ${gl.getProgramInfoLog(prog) ?? 'unknown'}`)
  }
  return prog
}

function hexToRgba (hex: string): [number, number, number, number] {
  const hexValue = hex.replace('#', '')
  if (hexValue.length === 6 || hexValue.length === 8) {
    const r = parseInt(hexValue.slice(0, 2), 16) / 255
    const g = parseInt(hexValue.slice(2, 4), 16) / 255
    const b = parseInt(hexValue.slice(4, 6), 16) / 255
    const a = hexValue.length === 8 ? parseInt(hexValue.slice(6, 8), 16) / 255 : 1
    return [r, g, b, a]
  }
  // RGB shorthand
  if (hexValue.length === 3) {
    const r = parseInt(hexValue[0] + hexValue[0], 16) / 255
    const g = parseInt(hexValue[1] + hexValue[1], 16) / 255
    const b = parseInt(hexValue[2] + hexValue[2], 16) / 255
    return [r, g, b, 1]
  }
  return [0, 0, 0, 1]
}

/** Parse any CSS colour string to [r,g,b,a] in [0..1] */
function parseColor (color: string): [number, number, number, number] {
  if (color.startsWith('#')) return hexToRgba(color)
  // rgba(...) / rgb(...)
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

export interface BarRenderData {
  centerX: number
  open: number
  high: number
  low: number
  close: number
  wickColor: string
  bodyColor: string
  borderColor: string
}

// ---------------------------------------------------------------------------
// CandleWebGLRenderer
// ---------------------------------------------------------------------------

export class CandleWebGLRenderer {
  private readonly _gl: WebGL2RenderingContext
  private readonly _canvas: HTMLCanvasElement
  private readonly _program: WebGLProgram
  private readonly _vao: WebGLVertexArrayObject
  private readonly _vbo: WebGLBuffer

  // uniform locations
  private readonly _uPriceFrom: WebGLUniformLocation
  private readonly _uPriceRange: WebGLUniformLocation
  private readonly _uResolution: WebGLUniformLocation
  private readonly _uPixelRatio: WebGLUniformLocation
  private readonly _uBarHalfWidth: WebGLUniformLocation
  private readonly _uRenderMode: WebGLUniformLocation
  private readonly _uOhlcHalfSize: WebGLUniformLocation
  private readonly _uPanOffset: WebGLUniformLocation

  private _capacity = 0
  private _barCount = 0

  // ── GPU optimisation: pre-allocated CPU staging buffers ─────────────────────
  //  _stagingBuf grows with _capacity — reallocated only on capacity expansion
  //  (symbol change / history load). Avoids new Float32Array() allocations.
  private _stagingBuf: ArrayBuffer = new ArrayBuffer(512 * BYTES_PER_BAR)
  private _stagingF32: Float32Array = new Float32Array(this._stagingBuf)
  private _stagingU8:  Uint8Array   = new Uint8Array(this._stagingBuf)

  //  _singleBarBuf is fixed-size — NEVER reallocated after construction.
  //  updateLastBar() uses it exclusively → zero GC on the tick hot path.
  private readonly _singleBarBuf = new ArrayBuffer(BYTES_PER_BAR)
  private readonly _singleBarF32 = new Float32Array(this._singleBarBuf)
  private readonly _singleBarU8  = new Uint8Array(this._singleBarBuf)

  //  Color cache: charts typically use ≤6 distinct CSS color strings
  //  (bull/bear × wick/body/border). Cache avoids repeated parseColor() calls.
  private readonly _colorCache = new Map<string, readonly [number, number, number, number]>()

  // ── Dirty-flag: O(1) fingerprint fields ────────────────────────────────────
  //  Five cheap scalar comparisons replace the O(N) VBO re-upload when the
  //  visible bar set hasn't changed between frames (e.g. mid-render crosshair
  //  hover, tooltip redraws, UI state updates that don't touch price data).
  //  Covers: pan (X shifts), zoom (both X shift), new tick (close changes),
  //  style/theme change (bodyColor changes), data load (len changes).
  private _fingerprintBarCount = -1
  private _fingerprintFirstX = 0
  private _fingerprintLastX = 0
  private _fingerprintLastClose = 0
  private _fingerprintLastBodyColor = ''
  // ── Pan-offset optimisation (Priority 5) ─────────────────────────────────
  //  When the same bars are visible but shifted (pure pan), we skip the O(N)
  //  bufferSubData entirely and update only the u_panOffset uniform (O(1)).
  //  The VBO stores bars at their ORIGINAL load-time x-positions; the shader
  //  adds _panOffsetCss to each a_centerX at draw time.
  //  Full reload resets _panOffsetCss to 0 and writes bar.centerX as-is.
  //  updateLastBar subtracts _panOffsetCss so the VBO stays consistent.
  //
  //  Pan guard fingerprint: same bars ↔ same barCount + first/last OHLC +
  //  bar spacing (detects zoom which shifts bars non-uniformly).
  private _fingerprintFirstOpen = NaN   // first bar's open  — identifies which bar is first
  private _fingerprintFirstClose = NaN  // first bar's close
  private _fingerprintBarStep = 0       // pixels between adjacent bars (spacing == pan, not zoom)
  private _panOffsetCss = 0             // accumulated pan offset fed to u_panOffset uniform

  // ── Incremental dirty tracking ───────────────────────────────────────────────
  //  _vboVersion increments on every VBO write or pan-offset change.
  //  draw() writes _drawnVersion = _vboVersion and caches the draw params;
  //  on the next call, if both the version AND all params match, the entire
  //  GL pipeline (clear + draw) is skipped — O(1) fast path for any update
  //  that does not touch price data or viewport (e.g. style-only rebuilds).
  private _vboVersion    = 0
  private _drawnVersion  = -1
  private _lastPriceFrom    = NaN
  private _lastPriceRange   = NaN
  private _lastBarHalfWidth = NaN
  private _lastRenderMode   = -1
  private _lastOhlcHalfSize = NaN

  // ── LOD (Level of Detail) ─────────────────────────────────────────────────
  //  When bar density exceeds ~1.5 bars per CSS pixel, aggregate visible bars
  //  into canvas-width buckets before uploading.  Caps GPU work at O(canvas-width)
  //  regardless of how many historical bars are in view.
  private _canvasWidthCss = 0        // CSS pixel width tracked in resize() — LOD threshold
  private _lodActive = false         // true when LOD downsampling is in effect this frame
  private readonly _lodBuf: BarRenderData[] = []  // reused bucket buffer — amortised, no GC

  //  Dev-mode GPU frame-time profiling via EXT_disjoint_timer_query_webgl2.
  //  Warns to console when GPU frame exceeds the 4 ms budget (60 fps = 16 ms total).
  private _timerExt: GPUTimerEXT | null = null
  private _timerQuery: WebGLQuery | null = null
  // Guard: true only after the first gl.beginQuery() has been called.  Without
  // this, the first frame would try gl.getQueryParameter() on an unused query
  // object which causes an INVALID_OPERATION WebGL error.
  private _timerQueryActive = false

  constructor (container: HTMLElement) {
    const canvas = document.createElement('canvas')
    canvas.style.position = 'absolute'
    canvas.style.top = '0'
    canvas.style.left = '0'
    canvas.style.zIndex = '1'   // below Canvas2D layers (z-index 2)
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
    if (gl === null) throw new Error('[CandleWebGLRenderer] WebGL2 unavailable')
    this._gl = gl

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    this._program = createProgram(gl)
    gl.useProgram(this._program)

    // Cache uniform locations
    this._uPriceFrom    = gl.getUniformLocation(this._program, 'u_priceFrom')!
    this._uPriceRange   = gl.getUniformLocation(this._program, 'u_priceRange')!
    this._uResolution   = gl.getUniformLocation(this._program, 'u_resolution')!
    this._uPixelRatio   = gl.getUniformLocation(this._program, 'u_pixelRatio')!
    this._uRenderMode   = gl.getUniformLocation(this._program, 'u_renderMode')!
    this._uOhlcHalfSize = gl.getUniformLocation(this._program, 'u_ohlcHalfSize')!
    this._uBarHalfWidth = gl.getUniformLocation(this._program, 'u_barHalfWidth')!
    this._uPanOffset    = gl.getUniformLocation(this._program, 'u_panOffset')!

    this._vao = gl.createVertexArray()!
    gl.bindVertexArray(this._vao)

    this._vbo = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo)

    this._setupAttribs(gl)
    gl.bindVertexArray(null)

    // Dev-mode GPU timer — zero overhead in production builds
    if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
      const timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2') as GPUTimerEXT | null
      if (timerExt !== null) {
        this._timerExt  = timerExt
        this._timerQuery = gl.createQuery()
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Colour helpers
  // ---------------------------------------------------------------------------

  private _parseColorCached (color: string): readonly [number, number, number, number] {
    let cachedColor = this._colorCache.get(color)
    if (cachedColor === undefined) {
      cachedColor = parseColor(color)
      this._colorCache.set(color, cachedColor)
    }
    return cachedColor
  }

  private _packColor (
    rgba: readonly [number, number, number, number],
    u8: Uint8Array,
    byteOffset: number
  ): void {
    u8[byteOffset]     = (rgba[0] * 255 + 0.5) | 0
    u8[byteOffset + 1] = (rgba[1] * 255 + 0.5) | 0
    u8[byteOffset + 2] = (rgba[2] * 255 + 0.5) | 0
    u8[byteOffset + 3] = (rgba[3] * 255 + 0.5) | 0
  }

  /**
   * Write one bar into a Float32Array/Uint8Array pair at the given positions.
   * @param f32Base  float32 index of the bar's first float field
   * @param byteBase byte offset of the bar's start in the ArrayBuffer
   */
  private _writeBarIntoViews (
    bar: BarRenderData,
    f32: Float32Array,
    u8: Uint8Array,
    f32Base: number,
    byteBase: number
  ): void {
    // Store x adjusted for the accumulated pan offset so that the VBO always
    // holds coordinates in the frame of reference of the last full upload.
    // Shader adds u_panOffset back — net effect is the visual position.
    f32[f32Base + 0] = bar.centerX - this._panOffsetCss
    f32[f32Base + 1] = bar.open
    f32[f32Base + 2] = bar.high
    f32[f32Base + 3] = bar.low
    f32[f32Base + 4] = bar.close
    this._packColor(this._parseColorCached(bar.wickColor),   u8, byteBase + COLOR_BYTE_OFF)
    this._packColor(this._parseColorCached(bar.bodyColor),   u8, byteBase + COLOR_BYTE_OFF + 4)
    this._packColor(this._parseColorCached(bar.borderColor), u8, byteBase + COLOR_BYTE_OFF + 8)
  }

  // ---------------------------------------------------------------------------
  // Attribute bindings — packed layout (Float32 price fields + UByte color fields)
  // ---------------------------------------------------------------------------

  private _setupAttribs (gl: WebGL2RenderingContext): void {
    const prog   = this._program
    const stride = BYTES_PER_BAR

    const bindF32 = (name: string, byteOffset: number): void => {
      const loc = gl.getAttribLocation(prog, name)
      if (loc < 0) return
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, 1, gl.FLOAT, false, stride, byteOffset)
      gl.vertexAttribDivisor(loc, 1)
    }

    const bindU8Color = (name: string, byteOffset: number): void => {
      const loc = gl.getAttribLocation(prog, name)
      if (loc < 0) return
      gl.enableVertexAttribArray(loc)
      // normalized=true: GPU divides UNSIGNED_BYTE [0..255] by 255 → [0..1]
      gl.vertexAttribPointer(loc, 4, gl.UNSIGNED_BYTE, true, stride, byteOffset)
      gl.vertexAttribDivisor(loc, 1)
    }

    bindF32('a_centerX',       0)
    bindF32('a_open',          4)
    bindF32('a_high',          8)
    bindF32('a_low',          12)
    bindF32('a_close',        16)
    bindU8Color('a_wickColor',   20)
    bindU8Color('a_bodyColor',   24)
    bindU8Color('a_borderColor', 28)
  }

  // ---------------------------------------------------------------------------
  // Resize
  // ---------------------------------------------------------------------------

  resize (width: number, height: number): void {
    this._canvasWidthCss = width  // keep LOD threshold in sync with CSS layout
    const pixelRatio = getPixelRatio(this._canvas)
    const newCanvasWidth = Math.round(width  * pixelRatio)
    const newCanvasHeight = Math.round(height * pixelRatio)
    // Assigning canvas.width/height always resets the WebGL context (even for
    // same value in older browsers).  Skip the reset when dimensions are stable
    // to prevent the GPU texture reallocation that causes a visible blink on
    // every live-tick redraw.
    if (this._canvas.width === newCanvasWidth && this._canvas.height === newCanvasHeight) return
    this._canvas.style.width  = `${width}px`
    this._canvas.style.height = `${height}px`
    this._canvas.width  = newCanvasWidth
    this._canvas.height = newCanvasHeight
    this._vboVersion++  // canvas contents reset by dimension change — force redraw
  }

  // ---------------------------------------------------------------------------
  // LOD aggregation
  // ---------------------------------------------------------------------------

  /**
   * Aggregate `rawBars` into `targetCount` OHLC buckets written into `_lodBuf`.
   *   open    = first raw bar's open
   *   high    = max  of all raw bars' high in the bucket
   *   low     = min  of all raw bars' low  in the bucket
   *   close   = last raw bar's close
   *   centerX = first raw bar's centerX  (aligns bucket to its leftmost bar)
   *   colors  = last raw bar's colors    (reflects net close-vs-open direction)
   * `_lodBuf` grows as needed but never shrinks — zero GC once steady state.
   */
  private _applyLod (rawBars: BarRenderData[], targetCount: number): void {
    while (this._lodBuf.length < targetCount) {
      this._lodBuf.push({ centerX: 0, open: 0, high: 0, low: 0, close: 0, wickColor: '', bodyColor: '', borderColor: '' })
    }
    const n    = rawBars.length
    const step = n / targetCount
    for (let i = 0; i < targetCount; i++) {
      const startIdx = Math.floor(i * step)
      const endIdx   = Math.min(Math.floor((i + 1) * step) - 1, n - 1)
      const first    = rawBars[startIdx]
      const last     = rawBars[endIdx]
      let high = first.high
      let low  = first.low
      for (let j = startIdx + 1; j <= endIdx; j++) {
        const b = rawBars[j]
        if (b.high > high) high = b.high
        if (b.low  < low)  low  = b.low
      }
      const out       = this._lodBuf[i]
      out.centerX     = first.centerX
      out.open        = first.open
      out.high        = high
      out.low         = low
      out.close       = last.close
      out.wickColor   = last.wickColor
      out.bodyColor   = last.bodyColor
      out.borderColor = last.borderColor
    }
  }

  // ---------------------------------------------------------------------------
  // VBO management
  // ---------------------------------------------------------------------------

  private _ensureCapacity (count: number): void {
    if (count <= this._capacity) return
    const newCap = Math.max(count, this._capacity * 2, 512)
    // Regrow the CPU staging buffer in lock-step with the GPU VBO
    this._stagingBuf = new ArrayBuffer(newCap * BYTES_PER_BAR)
    this._stagingF32 = new Float32Array(this._stagingBuf)
    this._stagingU8  = new Uint8Array(this._stagingBuf)
    const gl = this._gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo)
    gl.bufferData(gl.ARRAY_BUFFER, newCap * BYTES_PER_BAR, gl.DYNAMIC_DRAW)
    this._capacity = newCap
  }

  /**
   * Full upload of all visible bars. Called on symbol/period change or initial load.
   * Packs all bar data into the pre-allocated staging buffer then streams to GPU
   * in a single bufferSubData call.
   *
   * LOD: when bar density > 1.5 bars/CSS-pixel, aggregates rawBars into
   * canvas-width buckets first (O(N) CPU cost, but O(canvas-width) GPU cost).
   *
   * Dirty-flag: an O(1) fingerprint check skips the upload when the visible bar
   * set is identical to the last uploaded frame (e.g. crosshair hover redraws).
   */
  setData (rawBars: BarRenderData[]): void {
    // LOD: cap instance count at canvas-pixel-width when bar density is too high.
    // Threshold 1.5 allows a small margin before aggregation kicks in.
    const LOD_THRESHOLD = 1.5
    let bars: BarRenderData[]
    if (this._canvasWidthCss > 0 && rawBars.length > this._canvasWidthCss * LOD_THRESHOLD) {
      const targetCount = Math.max(1, Math.floor(this._canvasWidthCss))
      this._applyLod(rawBars, targetCount)
      bars = this._lodBuf
      this._lodActive = true
    } else {
      bars = rawBars
      this._lodActive = false
    }
    const visibleBarCount = bars.length
    this._barCount = visibleBarCount
    if (visibleBarCount === 0) {
      this._fingerprintBarCount = 0
      return
    }

    // O(1) fingerprint — skip the O(N) staging + bufferSubData when unchanged
    const firstBar = bars[0]
    const lastBar  = bars[visibleBarCount - 1]
    if (
      visibleBarCount               === this._fingerprintBarCount    &&
      firstBar.centerX              === this._fingerprintFirstX      &&
      lastBar.centerX               === this._fingerprintLastX       &&
      lastBar.close                 === this._fingerprintLastClose   &&
      lastBar.bodyColor             === this._fingerprintLastBodyColor
    ) return

    // ── Pan-offset fast path (Priority 5) ───────────────────────────────
    // Detect a pure pan: same bars (same count, same first/last OHLC identity,
    // same bar spacing so zoom didn't fire) but all x-positions shifted uniformly.
    // If detected → accumulate the pixel delta into _panOffsetCss and return
    // without touching the VBO at all.  The vertex shader adds _panOffsetCss
    // to every a_centerX, so the visual result is identical.
    const currentBarStep = visibleBarCount >= 2
      ? bars[1].centerX - firstBar.centerX
      : this._fingerprintBarStep
    if (
      visibleBarCount               === this._fingerprintBarCount     &&
      lastBar.close                 === this._fingerprintLastClose    &&
      lastBar.bodyColor             === this._fingerprintLastBodyColor &&
      firstBar.open                 === this._fingerprintFirstOpen    &&
      firstBar.close                === this._fingerprintFirstClose   &&
      currentBarStep                === this._fingerprintBarStep
    ) {
      // Pure pan — update accumulated offset + x-fingerprint, skip VBO write
      this._panOffsetCss += firstBar.centerX - this._fingerprintFirstX
      this._fingerprintFirstX = firstBar.centerX
      this._fingerprintLastX = lastBar.centerX
      this._vboVersion++   // u_panOffset uniform will change → draw() must run
      return
    }

    // ── Full re-upload ────────────────────────────────────────────────────────────
    // Reset pan accumulator: the VBO will be written with the current visual
    // positions, so the shader must add 0 (no net pan offset).
    this._panOffsetCss = 0
    this._fingerprintBarCount = visibleBarCount
    this._fingerprintFirstX = firstBar.centerX
    this._fingerprintLastX = lastBar.centerX
    this._fingerprintLastClose = lastBar.close
    this._fingerprintLastBodyColor = lastBar.bodyColor
    this._fingerprintFirstOpen = firstBar.open
    this._fingerprintFirstClose = firstBar.close
    this._fingerprintBarStep = currentBarStep

    this._ensureCapacity(visibleBarCount)

    const f32 = this._stagingF32
    const u8  = this._stagingU8
    for (let i = 0; i < visibleBarCount; i++) {
      // BYTES_PER_BAR = 32 → f32Base = i * 8  (32 / sizeof(float32) = 8)
      this._writeBarIntoViews(bars[i], f32, u8, i << 3, i * BYTES_PER_BAR)
    }

    const gl = this._gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._stagingU8, 0, visibleBarCount * BYTES_PER_BAR)
    this._vboVersion++   // VBO updated — draw() must re-render
  }

  /**
   * O(1) partial update for the last bar (live tick).
   * Uses the pre-allocated _singleBarBuf — zero GC on the tick hot path.
   * Keeps the dirty-flag fingerprint in sync so the next setData() call
   * correctly skips the full re-upload.
   */
  updateLastBar (bar: BarRenderData): void {
    if (this._barCount === 0) return
    // When LOD is active the last VBO slot is an aggregated bucket whose high/low
    // come from multiple raw bars.  A single-bar partial write would corrupt it.
    // Skip the optimisation and let the next setData() re-aggregate correctly.
    if (this._lodActive) return
    this._fingerprintLastClose = bar.close    // fingerprint: last-bar close matches new value
    this._writeBarIntoViews(bar, this._singleBarF32, this._singleBarU8, 0, 0)
    const gl = this._gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo)
    gl.bufferSubData(
      gl.ARRAY_BUFFER,
      (this._barCount - 1) * BYTES_PER_BAR,
      this._singleBarBuf
    )
    this._vboVersion++   // last-bar VBO slot updated — draw() must re-render
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  /**
   * Draw one frame.
   * @param priceFrom    realFrom of the visible Y-axis range
   * @param priceRange   realRange of the visible Y-axis range
   * @param barHalfWidth half of the visible bar width in CSS pixels
   * @param renderMode   0 = candle (solid/stroke), 1 = ohlc
   * @param ohlcHalfSize half of ohlcSize in CSS pixels (only used when renderMode=1)
   */
  draw (priceFrom: number, priceRange: number, barHalfWidth: number, renderMode = 0, ohlcHalfSize = 0): void {
    if (this._barCount === 0) return

    // Incremental dirty: skip the entire GL pipeline when the canvas is already
    // current — no VBO change, no pan, no Y-range or viewport parameter change.
    // Eliminates ~100 % of redundant redraws caused by style/layout rebuilds that
    // do not touch price data (e.g. tooltip hover, indicator recalculation with
    // the same output, theme reload with unchanged colours).
    if (
      this._vboVersion     === this._drawnVersion    &&
      priceFrom            === this._lastPriceFrom   &&
      priceRange           === this._lastPriceRange  &&
      barHalfWidth         === this._lastBarHalfWidth &&
      renderMode           === this._lastRenderMode  &&
      ohlcHalfSize         === this._lastOhlcHalfSize
    ) return
    this._drawnVersion     = this._vboVersion
    this._lastPriceFrom    = priceFrom
    this._lastPriceRange   = priceRange
    this._lastBarHalfWidth = barHalfWidth
    this._lastRenderMode   = renderMode
    this._lastOhlcHalfSize = ohlcHalfSize

    const gl = this._gl
    const pixelRatio = getPixelRatio(this._canvas)
    const canvasWidthPx = this._canvas.width   // physical pixels
    const canvasHeightPx = this._canvas.height

    // Dev-mode GPU timer: read previous frame's result (non-blocking),
    // then begin timing the current frame.
    // EXT_disjoint_timer_query_webgl2 uses gl.beginQuery/endQuery — NOT
    // the ext.beginQueryEXT/endQueryEXT methods (those are WebGL1-only).
    if (this._timerExt !== null && this._timerQuery !== null) {
      if (this._timerQueryActive) {
        const disjoint = gl.getParameter(this._timerExt.GPU_DISJOINT_EXT) as boolean
        if (!disjoint) {
          const ready = gl.getQueryParameter(this._timerQuery, gl.QUERY_RESULT_AVAILABLE) as boolean
          if (ready) {
            const ns = gl.getQueryParameter(this._timerQuery, gl.QUERY_RESULT) as number
            const ms = ns / 1_000_000
            if (ms > 4) {
              console.warn(`[CandleWebGLRenderer] GPU frame ${ms.toFixed(2)} ms (budget: 4 ms @ 60 fps)`)
            }
          }
        }
      }
      // WebGL2: begin/end query are methods on the gl context, not the extension
      gl.beginQuery(this._timerExt.TIME_ELAPSED_EXT, this._timerQuery)
      this._timerQueryActive = true
    }

    gl.viewport(0, 0, canvasWidthPx, canvasHeightPx)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    gl.useProgram(this._program)

    // O(1) uniform updates for pan/zoom — all coordinate transforms happen on GPU
    gl.uniform1f(this._uPriceFrom,    priceFrom)
    gl.uniform1f(this._uPriceRange,   priceRange)
    gl.uniform2f(this._uResolution,   canvasWidthPx, canvasHeightPx)
    gl.uniform1f(this._uPixelRatio,   pixelRatio)
    gl.uniform1f(this._uBarHalfWidth, barHalfWidth)
    gl.uniform1i(this._uRenderMode,   renderMode)
    gl.uniform1f(this._uOhlcHalfSize, ohlcHalfSize)
    gl.uniform1f(this._uPanOffset,    this._panOffsetCss)

    gl.bindVertexArray(this._vao)
    // Single instanced draw call: VERTS_PER_BAR vertices × barCount instances
    gl.drawArraysInstanced(gl.TRIANGLES, 0, VERTS_PER_BAR, this._barCount)
    gl.bindVertexArray(null)

    if (this._timerExt !== null && this._timerQuery !== null && this._timerQueryActive) {
      gl.endQuery(this._timerExt.TIME_ELAPSED_EXT)
    }
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  destroy (): void {
    const gl = this._gl
    if (this._timerQuery !== null) gl.deleteQuery(this._timerQuery)
    gl.deleteVertexArray(this._vao)
    gl.deleteBuffer(this._vbo)
    gl.deleteProgram(this._program)
    const ext = gl.getExtension('WEBGL_lose_context')
    ext?.loseContext()
    this._canvas.remove()
  }

  // ---------------------------------------------------------------------------
  // Static capability check
  // ---------------------------------------------------------------------------

  static isSupported (): boolean {
    return _webgl2Supported
  }
}

// ---------------------------------------------------------------------------
// WebGL2 support is probed once at module load time and cached.  Calling
// getContext('webgl2') on a throwaway canvas on every draw frame is the
// primary cause of "Too many active WebGL contexts" — browsers count
// unreleased probe contexts against the per-page limit (~16).
// ---------------------------------------------------------------------------
const _webgl2Supported: boolean = (() => {
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2')
    if (gl === null) return false
    // Explicitly lose the probe context so the browser can free the slot.
    const ext = gl.getExtension('WEBGL_lose_context')
    ext?.loseContext()
    return true
  } catch {
    return false
  }
})()

// ---------------------------------------------------------------------------
// WeakMap cache: DrawWidget instance → CandleWebGLRenderer
// Avoids re-creating the GL context on every drawImp call and prevents
// leaking the renderer across widget instances.
// ---------------------------------------------------------------------------
const _rendererCache = new WeakMap<object, CandleWebGLRenderer>()

export function getOrCreateRenderer (
  widgetKey: object,
  container: HTMLElement
): CandleWebGLRenderer | null {
  if (!_webgl2Supported) return null
  let r = _rendererCache.get(widgetKey)
  if (r === undefined) {
    try {
      r = new CandleWebGLRenderer(container)
      _rendererCache.set(widgetKey, r)
    } catch {
      return null
    }
  }
  return r
}

export function destroyRenderer (widgetKey: object): void {
  const r = _rendererCache.get(widgetKey)
  if (r !== undefined) {
    r.destroy()
    _rendererCache.delete(widgetKey)
  }
}
