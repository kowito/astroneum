import { getPixelRatio } from './utils/canvas'
import { WebGLCanvas } from './WebGLCanvas'
import { BYTES_PER_BAR, COLOR_BYTE_OFF, VERTS_PER_BAR, VERT_SRC, FRAG_SRC, parseColor } from './candleShaders'

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
// Constants, shaders and colour helpers imported from candleShaders.ts
// (shared with CandleWorkerRenderer so both paths stay byte-identical).
// ---------------------------------------------------------------------------

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

// hexToRgba and parseColor are imported from candleShaders.ts

export interface BarRenderData {
  centerX: number
  open: number
  high: number
  low: number
  close: number
  wickColor: string
  bodyColor: string
  borderColor: string
  /** 0-based index into the chart data list — used by the VBO overscan fast path. */
  dataIndex?: number
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
  // ── VBO overscan (Priority 15) ─────────────────────────────────────────────
  //  Stores OVERSCAN bars before/after the visible range in the VBO so that
  //  panning by a few bars doesn't require a full O(N) re-upload.  When the
  //  new visible range falls within the stored overscan, just update
  //  _drawStartOffset and _panOffsetCss (O(1)) without touching the VBO.
  private _vboFirstDataIdx = -1    // dataIndex of VBO[0] bar
  private _vboLastDataIdx  = -1    // dataIndex of VBO[_barCount-1] bar
  private _vboBar0X        = 0     // CSS pixel X of VBO[0] bar at last full upload
  private _vboBarStep      = 0     // CSS pixel bar spacing at last full upload
  private _drawStartOffset = 0     // VBO instance offset (skip overscan prefix)
  private _visibleBarCount = 0     // number of visible bars to draw
  private _lastDrawStartOffset = -1  // last value used to rebind attribs

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
    gl.disable(gl.DEPTH_TEST)     // 2D only — no depth reads/writes
    gl.enable(gl.SCISSOR_TEST)    // reject fragments outside the pane canvas

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
    this._rebindAttribsWithOffset(gl, 0)
  }

  /**
   * Rebind all instanced attribute pointers with a base byte offset.
   * Called during construction (offset = 0) and in draw() when _drawStartOffset
   * changes (overscan fast path) — updates the VAO's captured state.
   */
  private _rebindAttribsWithOffset (gl: WebGL2RenderingContext, baseOffset: number): void {
    const prog   = this._program
    const stride = BYTES_PER_BAR

    const bindF32 = (name: string, fieldOffset: number): void => {
      const loc = gl.getAttribLocation(prog, name)
      if (loc < 0) return
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, 1, gl.FLOAT, false, stride, baseOffset + fieldOffset)
      gl.vertexAttribDivisor(loc, 1)
    }

    const bindU8Color = (name: string, fieldOffset: number): void => {
      const loc = gl.getAttribLocation(prog, name)
      if (loc < 0) return
      gl.enableVertexAttribArray(loc)
      // normalized=true: GPU divides UNSIGNED_BYTE [0..255] by 255 → [0..1]
      gl.vertexAttribPointer(loc, 4, gl.UNSIGNED_BYTE, true, stride, baseOffset + fieldOffset)
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
   * Full upload of all visible bars (+ optional overscan prefix/suffix).
   * Called on symbol/period change or initial load.
   * Packs all bar data into the pre-allocated staging buffer then streams to GPU
   * in a single bufferSubData call.
   *
   * @param rawBars       All bars to upload (overscan + visible + overscan).
   * @param visibleOffset Index within rawBars of the first visible bar (default 0).
   * @param visibleCount  Number of visible bars to draw (default rawBars.length).
   *
   * LOD: when bar density > 1.5 bars/CSS-pixel, aggregates rawBars into
   * canvas-width buckets first (O(N) CPU cost, but O(canvas-width) GPU cost).
   *
   * Dirty-flag: an O(1) fingerprint check skips the upload when the visible bar
   * set is identical to the last uploaded frame (e.g. crosshair hover redraws).
   *
   * Overscan fast path: when the new visible range falls within the VBO's stored
   * data-index range, updates _drawStartOffset and _panOffsetCss without any
   * VBO upload — O(1) even when new bars scroll into view from the buffer.
   */
  setData (rawBars: BarRenderData[], visibleOffset = 0, visibleCount = rawBars.length): void {
    // ── Overscan fast path (Priority 15) ─────────────────────────────────────
    // When the caller provides dataIndex on each bar and the new visible range
    // falls entirely within the VBO's previously-uploaded data range, skip the
    // VBO write and just update the draw-start offset + pan offset.
    // Guard: skip when LOD is active (aggregated buckets break the index mapping).
    if (
      !this._lodActive &&
      visibleOffset > 0 &&
      visibleCount > 0 &&
      visibleOffset + visibleCount <= rawBars.length &&
      this._barCount > 0 &&
      this._vboFirstDataIdx >= 0 &&
      this._vboBarStep !== 0
    ) {
      const firstVis = rawBars[visibleOffset]
      const lastVis  = rawBars[visibleOffset + visibleCount - 1]
      if (
        firstVis.dataIndex !== undefined &&
        lastVis.dataIndex  !== undefined &&
        firstVis.dataIndex >= this._vboFirstDataIdx &&
        lastVis.dataIndex  <= this._vboLastDataIdx  &&
        // Ensure bar step matches (guards against zoom change)
        (visibleCount < 2 || (rawBars[visibleOffset + 1].centerX - firstVis.centerX) === this._vboBarStep)
      ) {
        const newDrawStart = firstVis.dataIndex - this._vboFirstDataIdx
        // Recompute pan offset: new visualX of first visible bar must equal
        // stored VBO X + _panOffsetCss (shader adds the offset at draw time).
        // storedX = _vboBar0X + newDrawStart * _vboBarStep
        const storedX = this._vboBar0X + newDrawStart * this._vboBarStep
        this._panOffsetCss  = firstVis.centerX - storedX
        this._drawStartOffset = newDrawStart
        this._visibleBarCount = visibleCount
        // Update fingerprints so the pure-pan path works on subsequent frames
        this._fingerprintBarCount = visibleCount
        this._fingerprintFirstX = firstVis.centerX
        this._fingerprintLastX  = lastVis.centerX
        this._fingerprintLastClose = lastVis.close
        this._fingerprintLastBodyColor = lastVis.bodyColor
        this._fingerprintFirstOpen  = firstVis.open
        this._fingerprintFirstClose = firstVis.close
        this._fingerprintBarStep = visibleCount >= 2
          ? rawBars[visibleOffset + 1].centerX - firstVis.centerX
          : this._fingerprintBarStep
        this._vboVersion++   // draw params changed — must redraw
        return
      }
    }

    // LOD: cap instance count at canvas-pixel-width when bar density is too high.
    // Use visibleCount (not rawBars.length) so overscan bars don't skew the threshold.
    // When LOD is active, aggregate only the visible window; drawStartOffset = 0.
    const LOD_THRESHOLD = 1.5
    let bars: BarRenderData[]
    const rawVisibleCount = Math.min(visibleCount, rawBars.length - visibleOffset)
    if (this._canvasWidthCss > 0 && rawVisibleCount > this._canvasWidthCss * LOD_THRESHOLD) {
      const targetCount = Math.max(1, Math.floor(this._canvasWidthCss))
      // Slice visible bars only for LOD aggregation (keeps overscan out of buckets)
      const visibleSlice = (visibleOffset === 0 && rawVisibleCount === rawBars.length)
        ? rawBars
        : rawBars.slice(visibleOffset, visibleOffset + rawVisibleCount)
      this._applyLod(visibleSlice, targetCount)
      bars = this._lodBuf
      this._lodActive = true
    } else {
      bars = rawBars
      this._lodActive = false
    }
    const totalBarCount = bars.length
    this._barCount = totalBarCount
    if (totalBarCount === 0) {
      this._fingerprintBarCount = 0
      return
    }

    // For fingerprint and pan-offset checks, use the VISIBLE portion of bars.
    // When LOD is active bars = _lodBuf (only visible, no overscan), fpStart = 0.
    // When LOD is inactive bars = rawBars (full array), fpStart = visibleOffset.
    const fpStart = this._lodActive ? 0 : visibleOffset
    const fpCount = this._lodActive ? totalBarCount : Math.min(visibleCount, totalBarCount - visibleOffset)
    if (fpCount === 0) {
      this._fingerprintBarCount = 0
      return
    }

    // O(1) fingerprint — skip the O(N) staging + bufferSubData when unchanged
    const firstBar = bars[fpStart]
    const lastBar  = bars[fpStart + fpCount - 1]
    if (
      fpCount                       === this._fingerprintBarCount    &&
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
    const currentBarStep = fpCount >= 2
      ? bars[fpStart + 1].centerX - firstBar.centerX
      : this._fingerprintBarStep
    if (
      fpCount                       === this._fingerprintBarCount     &&
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
    this._fingerprintBarCount = fpCount
    this._fingerprintFirstX = firstBar.centerX
    this._fingerprintLastX = lastBar.centerX
    this._fingerprintLastClose = lastBar.close
    this._fingerprintLastBodyColor = lastBar.bodyColor
    this._fingerprintFirstOpen = firstBar.open
    this._fingerprintFirstClose = firstBar.close
    this._fingerprintBarStep = currentBarStep

    // ── Overscan metadata ────────────────────────────────────────────────────
    // Store first/last dataIndex and bar geometry so the overscan fast path can
    // detect future setData() calls that fall within this VBO's range.
    // When no dataIndex is provided (non-overscan caller), disable the fast path.
    this._vboFirstDataIdx = bars[0].dataIndex ?? -1
    this._vboLastDataIdx  = bars[totalBarCount - 1].dataIndex ?? -1
    this._vboBar0X        = bars[0].centerX   // X at upload time (panOffset=0)
    this._vboBarStep      = currentBarStep
    // Draw parameters for the visible window within the overscan array.
    // When caller passes visibleOffset=0 (default), these equal the full range.
    // For LOD paths _drawStartOffset is always 0 (whole aggregated array is visible).
    this._drawStartOffset = this._lodActive ? 0 : visibleOffset
    this._visibleBarCount = this._lodActive ? totalBarCount : fpCount

    this._ensureCapacity(totalBarCount)

    const f32 = this._stagingF32
    const u8  = this._stagingU8
    for (let i = 0; i < totalBarCount; i++) {
      // BYTES_PER_BAR = 32 → f32Base = i * 8  (32 / sizeof(float32) = 8)
      this._writeBarIntoViews(bars[i], f32, u8, i << 3, i * BYTES_PER_BAR)
    }

    const gl = this._gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._stagingU8, 0, totalBarCount * BYTES_PER_BAR)
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
    // With overscan, the live-tick bar is always the last VISIBLE bar
    // (at _drawStartOffset + _visibleBarCount - 1 in the VBO).
    const lastVisibleVboIdx = this._visibleBarCount > 0
      ? this._drawStartOffset + this._visibleBarCount - 1
      : this._barCount - 1
    gl.bufferSubData(
      gl.ARRAY_BUFFER,
      lastVisibleVboIdx * BYTES_PER_BAR,
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
    gl.scissor(0, 0, canvasWidthPx, canvasHeightPx)
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
    // Overscan: rebind attribute pointers if the draw-start offset changed.
    // This updates the VAO's captured state so the draw call starts at the
    // correct VBO byte position (skipping the overscan prefix).
    const drawStartByte = this._drawStartOffset * BYTES_PER_BAR
    if (this._drawStartOffset !== this._lastDrawStartOffset) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo)
      this._rebindAttribsWithOffset(gl, drawStartByte)
      this._lastDrawStartOffset = this._drawStartOffset
    }
    // Use _visibleBarCount (excludes overscan) if set, else fall back to _barCount.
    const instanceCount = this._visibleBarCount > 0 ? this._visibleBarCount : this._barCount
    // Single instanced draw call: VERTS_PER_BAR vertices × instanceCount instances
    gl.drawArraysInstanced(gl.TRIANGLES, 0, VERTS_PER_BAR, instanceCount)
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
    return WebGLCanvas.isSupported()
  }
}

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
  if (!WebGLCanvas.isSupported()) return null
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
