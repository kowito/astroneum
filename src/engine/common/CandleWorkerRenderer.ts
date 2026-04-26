// ---------------------------------------------------------------------------
// CandleWorkerRenderer — OffscreenCanvas + Web Worker candle renderer.
//
// Architecture:
//   Main thread  — LOD, colour parsing, staging-buffer pack (CPU-intensive JS)
//   Worker       — gl.bufferSubData + gl.drawArraysInstanced (GPU driver calls)
//
// Moving the GPU-command submission off the main thread means scroll/hover
// events are no longer blocked by the GL driver during candle draw calls,
// eliminating the ~1-2 ms main-thread stalls visible in worst-case profiles.
//
// Worker message protocol (main → worker):
//   { type: 'init',         canvas: OffscreenCanvas }
//   { type: 'upload',       bytes: Uint8Array, count: number }
//   { type: 'uploadPartial',bytes: Uint8Array, byteOffset: number }
//   { type: 'draw',         barCount, priceFrom, priceRange, barHalfWidth,
//                           renderMode, ohlcHalfSize, panOffset,
//                           physW, physH, pixelRatio }
//   { type: 'resize',       physW, physH }
//   { type: 'destroy' }
//
// Worker → main:
//   { type: 'ready' }  — after init completes
//   { type: 'error', msg: string }
//
// Fallback: when OffscreenCanvas or Worker is unavailable, CandleBarView uses
// CandleWebGLRenderer (main-thread GL) transparently.
// ---------------------------------------------------------------------------

import { WebGLCanvas } from './WebGLCanvas'
import {
  BYTES_PER_BAR,
  COLOR_BYTE_OFF,
  VERTS_PER_BAR,
  VERT_SRC,
  FRAG_SRC,
  parseColor,
} from './candleShaders'
import type { BarRenderData } from './CandleWebGLRenderer'
import { getPixelRatio } from './utils/canvas'

// ---------------------------------------------------------------------------
// Worker source — built once at module load, reused per renderer instance.
// JSON.stringify embeds the shader strings safely (handles newlines, quotes…).
// ---------------------------------------------------------------------------
function _buildWorkerSrc (): string {
  return `'use strict';
const BYTES_PER_BAR  = ${BYTES_PER_BAR};
const COLOR_BYTE_OFF = ${COLOR_BYTE_OFF};
const VERTS_PER_BAR  = ${VERTS_PER_BAR};
const VERT_SRC = ${JSON.stringify(VERT_SRC)};
const FRAG_SRC = ${JSON.stringify(FRAG_SRC)};

let gl, program, vao, vbo, capacity = 0;
let uPriceFrom, uPriceRange, uResolution, uPixelRatio,
    uBarHalfWidth, uRenderMode, uOhlcHalfSize, uPanOffset;

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const msg = gl.getShaderInfoLog(s) || 'unknown';
    gl.deleteShader(s);
    throw new Error('[CandleWorker] shader compile error: ' + msg);
  }
  return s;
}

function init(canvas) {
  gl = canvas.getContext('webgl2', {
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
    alpha: true
  });
  if (!gl) {
    self.postMessage({ type: 'error', msg: 'WebGL2 unavailable in worker' });
    return;
  }

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.SCISSOR_TEST);

  const vert = compile(gl.VERTEX_SHADER, VERT_SRC);
  const frag = compile(gl.FRAGMENT_SHADER, FRAG_SRC);
  program = gl.createProgram();
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    self.postMessage({ type: 'error', msg: '[CandleWorker] link error: ' + (gl.getProgramInfoLog(program) || 'unknown') });
    return;
  }
  gl.useProgram(program);

  uPriceFrom    = gl.getUniformLocation(program, 'u_priceFrom');
  uPriceRange   = gl.getUniformLocation(program, 'u_priceRange');
  uResolution   = gl.getUniformLocation(program, 'u_resolution');
  uPixelRatio   = gl.getUniformLocation(program, 'u_pixelRatio');
  uBarHalfWidth = gl.getUniformLocation(program, 'u_barHalfWidth');
  uRenderMode   = gl.getUniformLocation(program, 'u_renderMode');
  uOhlcHalfSize = gl.getUniformLocation(program, 'u_ohlcHalfSize');
  uPanOffset    = gl.getUniformLocation(program, 'u_panOffset');

  vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);

  const stride = BYTES_PER_BAR;
  function bindF32(name, offset) {
    const loc = gl.getAttribLocation(program, name);
    if (loc < 0) return;
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 1, gl.FLOAT, false, stride, offset);
    gl.vertexAttribDivisor(loc, 1);
  }
  function bindU8Color(name, offset) {
    const loc = gl.getAttribLocation(program, name);
    if (loc < 0) return;
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 4, gl.UNSIGNED_BYTE, true, stride, offset);
    gl.vertexAttribDivisor(loc, 1);
  }
  bindF32      ('a_centerX',      0);
  bindF32      ('a_open',         4);
  bindF32      ('a_high',         8);
  bindF32      ('a_low',         12);
  bindF32      ('a_close',       16);
  bindU8Color  ('a_wickColor',   20);
  bindU8Color  ('a_bodyColor',   24);
  bindU8Color  ('a_borderColor', 28);
  gl.bindVertexArray(null);

  self.postMessage({ type: 'ready' });
}

self.onmessage = function(e) {
  const msg = e.data;
  switch (msg.type) {
    case 'init':
      try { init(msg.canvas); }
      catch (err) { self.postMessage({ type: 'error', msg: String(err) }); }
      break;

    case 'upload': {
      // Full VBO upload — bytes is a structured-clone of the staging Uint8Array.
      const { bytes, count } = msg;
      const byteLen = count * BYTES_PER_BAR;
      if (count > capacity) {
        const newCap = Math.max(count, capacity * 2, 512);
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, newCap * BYTES_PER_BAR, gl.DYNAMIC_DRAW);
        capacity = newCap;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, bytes, 0, byteLen);
      break;
    }

    case 'uploadPartial': {
      // Partial update for the last bar (live tick optimisation).
      const { bytes, byteOffset } = msg;
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, byteOffset, bytes);
      break;
    }

    case 'draw': {
      const {
        barCount, priceFrom, priceRange, barHalfWidth,
        renderMode, ohlcHalfSize, panOffset,
        physW, physH, pixelRatio
      } = msg;
      if (barCount === 0) return;
      gl.viewport(0, 0, physW, physH);
      gl.scissor(0, 0, physW, physH);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform1f(uPriceFrom,    priceFrom);
      gl.uniform1f(uPriceRange,   priceRange);
      gl.uniform2f(uResolution,   physW, physH);
      gl.uniform1f(uPixelRatio,   pixelRatio);
      gl.uniform1f(uBarHalfWidth, barHalfWidth);
      gl.uniform1i(uRenderMode,   renderMode);
      gl.uniform1f(uOhlcHalfSize, ohlcHalfSize);
      gl.uniform1f(uPanOffset,    panOffset);
      gl.bindVertexArray(vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, VERTS_PER_BAR, barCount);
      gl.bindVertexArray(null);
      break;
    }

    case 'resize': {
      const { physW, physH } = msg;
      const canvas = gl.canvas;
      if (canvas.width !== physW || canvas.height !== physH) {
        canvas.width  = physW;
        canvas.height = physH;
      }
      break;
    }

    case 'destroy': {
      gl.deleteVertexArray(vao);
      gl.deleteBuffer(vbo);
      gl.deleteProgram(program);
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
      self.close();
      break;
    }
  }
};
`
}

let _workerSrcCache: string | null = null
function _getWorkerSrc (): string {
  if (_workerSrcCache === null) _workerSrcCache = _buildWorkerSrc()
  return _workerSrcCache
}

// ---------------------------------------------------------------------------
// CandleWorkerRenderer
//
// Mirrors the public API of CandleWebGLRenderer so CandleBarView can swap
// between the two without any call-site changes.
// ---------------------------------------------------------------------------
export class CandleWorkerRenderer {
  private readonly _canvas: HTMLCanvasElement
  private readonly _worker: Worker
  private _workerReady = false

  // ── Staging buffer (same as CandleWebGLRenderer — all data prep stays here)
  private _capacity = 0
  private _stagingBuf: ArrayBuffer = new ArrayBuffer(0)
  private _stagingF32: Float32Array = new Float32Array(0)
  private _stagingU8: Uint8Array  = new Uint8Array(0)

  // Single-bar buffer for updateLastBar (zero-GC live-tick path)
  private readonly _singleBarBuf = new ArrayBuffer(BYTES_PER_BAR)
  private readonly _singleBarF32 = new Float32Array(this._singleBarBuf)
  private readonly _singleBarU8  = new Uint8Array(this._singleBarBuf)

  // Colour cache
  private readonly _colorCache = new Map<string, readonly [number, number, number, number]>()

  // LOD
  private _canvasWidthCss = 0
  private _lodActive = false
  private readonly _lodBuf: BarRenderData[] = []

  // Dirty-flag fingerprints (same semantics as CandleWebGLRenderer)
  private _fingerprintBarCount      = -1
  private _fingerprintFirstX        = 0
  private _fingerprintLastX         = 0
  private _fingerprintLastClose     = 0
  private _fingerprintLastBodyColor = ''
  private _fingerprintFirstOpen     = NaN
  private _fingerprintFirstClose    = NaN
  private _fingerprintBarStep       = 0
  private _panOffsetCss             = 0

  // Incremental draw dirty tracking
  private _barCount        = 0
  private _vboVersion      = 0
  private _drawnVersion    = -1
  private _lastPriceFrom   = NaN
  private _lastPriceRange  = NaN
  private _lastBarHalfWidth = NaN
  private _lastRenderMode  = -1
  private _lastOhlcHalfSize = NaN

  // Physical pixel dimensions (updated in resize)
  private _physW = 0
  private _physH = 0
  private _pixelRatio = 1

  constructor (container: HTMLElement) {
    // Create the placeholder canvas element (CSS styling only after transfer)
    const canvas = document.createElement('canvas')
    canvas.style.position    = 'absolute'
    canvas.style.top         = '0'
    canvas.style.left        = '0'
    canvas.style.zIndex      = '1'   // below Canvas2D layers (z-index 2)
    canvas.style.pointerEvents = 'none'
    container.appendChild(canvas)
    this._canvas = canvas

    // Spawn the worker from a Blob URL — safe for library bundles (no import path)
    const blob    = new Blob([_getWorkerSrc()], { type: 'application/javascript' })
    const blobUrl = URL.createObjectURL(blob)
    const worker  = new Worker(blobUrl)
    URL.revokeObjectURL(blobUrl)   // worker is already alive; safe to revoke
    this._worker = worker

    worker.onerror = (ev) => {
      // eslint-disable-next-line no-console
      console.error('[CandleWorkerRenderer] worker error', ev.message)
    }
    worker.onmessage = (e) => {
      if (e.data.type === 'ready') this._workerReady = true
      if (e.data.type === 'error') {
        // eslint-disable-next-line no-console
        console.error('[CandleWorkerRenderer] worker reported error:', e.data.msg)
      }
    }

    // Transfer canvas control to the worker (zero-copy — the OffscreenCanvas
    // is a Transferable, so no pixel data is copied across the thread boundary)
    const offscreen = canvas.transferControlToOffscreen()
    worker.postMessage({ type: 'init', canvas: offscreen }, [offscreen])
  }

  // ---------------------------------------------------------------------------
  // Colour helpers (mirror of CandleWebGLRenderer private methods)
  // ---------------------------------------------------------------------------

  private _parseColorCached (color: string): readonly [number, number, number, number] {
    let c = this._colorCache.get(color)
    if (c === undefined) {
      c = parseColor(color)
      this._colorCache.set(color, c)
    }
    return c
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

  private _writeBarIntoViews (
    bar: BarRenderData,
    f32: Float32Array,
    u8: Uint8Array,
    f32Base: number,
    byteBase: number
  ): void {
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
  // LOD aggregation (identical to CandleWebGLRenderer._applyLod)
  // ---------------------------------------------------------------------------

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
  // Capacity management
  // ---------------------------------------------------------------------------

  private _ensureCapacity (count: number): void {
    if (count <= this._capacity) return
    const newCap = Math.max(count, this._capacity * 2, 512)
    this._stagingBuf = new ArrayBuffer(newCap * BYTES_PER_BAR)
    this._stagingF32 = new Float32Array(this._stagingBuf)
    this._stagingU8  = new Uint8Array(this._stagingBuf)
    this._capacity   = newCap
    // Worker needs to know the new capacity so it can call bufferData.
    // This is handled implicitly: worker reallocates when count > capacity in 'upload'.
  }

  // ---------------------------------------------------------------------------
  // setData — identical fingerprint + pan-offset logic as CandleWebGLRenderer.
  // Instead of calling gl.bufferSubData, posts 'upload' to the worker.
  // ---------------------------------------------------------------------------

  setData (rawBars: BarRenderData[]): void {
    if (!this._workerReady) return   // worker not yet initialised

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

    const firstBar = bars[0]
    const lastBar  = bars[visibleBarCount - 1]
    if (
      visibleBarCount               === this._fingerprintBarCount    &&
      firstBar.centerX              === this._fingerprintFirstX      &&
      lastBar.centerX               === this._fingerprintLastX       &&
      lastBar.close                 === this._fingerprintLastClose   &&
      lastBar.bodyColor             === this._fingerprintLastBodyColor
    ) return

    // Pan-offset fast path
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
      this._panOffsetCss       += firstBar.centerX - this._fingerprintFirstX
      this._fingerprintFirstX   = firstBar.centerX
      this._fingerprintLastX    = lastBar.centerX
      this._vboVersion++
      return
    }

    // Full re-upload
    this._panOffsetCss             = 0
    this._fingerprintBarCount      = visibleBarCount
    this._fingerprintFirstX        = firstBar.centerX
    this._fingerprintLastX         = lastBar.centerX
    this._fingerprintLastClose     = lastBar.close
    this._fingerprintLastBodyColor = lastBar.bodyColor
    this._fingerprintFirstOpen     = firstBar.open
    this._fingerprintFirstClose    = firstBar.close
    this._fingerprintBarStep       = currentBarStep

    this._ensureCapacity(visibleBarCount)

    const f32 = this._stagingF32
    const u8  = this._stagingU8
    for (let i = 0; i < visibleBarCount; i++) {
      this._writeBarIntoViews(bars[i], f32, u8, i << 3, i * BYTES_PER_BAR)
    }

    // Structured-clone the staging slice — worker receives its own copy; main
    // thread keeps the original buffer intact for subsequent frames.
    const byteLen = visibleBarCount * BYTES_PER_BAR
    const uploadBytes = this._stagingU8.slice(0, byteLen)   // O(N) copy, ~16 KB max
    this._worker.postMessage({ type: 'upload', bytes: uploadBytes, count: visibleBarCount })
    this._vboVersion++
  }

  updateLastBar (bar: BarRenderData): void {
    if (this._barCount === 0 || this._lodActive || !this._workerReady) return
    this._fingerprintLastClose = bar.close
    this._writeBarIntoViews(bar, this._singleBarF32, this._singleBarU8, 0, 0)
    const byteOffset = (this._barCount - 1) * BYTES_PER_BAR
    const bytes = this._singleBarU8.slice()   // 32-byte copy
    this._worker.postMessage({ type: 'uploadPartial', bytes, byteOffset })
    this._vboVersion++
  }

  // ---------------------------------------------------------------------------
  // resize
  // ---------------------------------------------------------------------------

  resize (width: number, height: number): void {
    this._canvasWidthCss = width
    const pixelRatio = getPixelRatio(this._canvas)
    const physW = Math.round(width  * pixelRatio)
    const physH = Math.round(height * pixelRatio)

    // Update CSS geometry (worker controls physical dimensions)
    this._canvas.style.width  = `${width}px`
    this._canvas.style.height = `${height}px`

    if (physW === this._physW && physH === this._physH && pixelRatio === this._pixelRatio) return
    this._physW      = physW
    this._physH      = physH
    this._pixelRatio = pixelRatio

    if (this._workerReady) {
      this._worker.postMessage({ type: 'resize', physW, physH })
    }
    this._vboVersion++   // canvas size changed → force redraw
  }

  // ---------------------------------------------------------------------------
  // draw — posts uniforms to worker; worker calls drawArraysInstanced
  // ---------------------------------------------------------------------------

  draw (
    priceFrom: number,
    priceRange: number,
    barHalfWidth: number,
    renderMode = 0,
    ohlcHalfSize = 0
  ): void {
    if (this._barCount === 0 || !this._workerReady) return

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

    this._worker.postMessage({
      type        : 'draw',
      barCount    : this._barCount,
      priceFrom,
      priceRange,
      barHalfWidth,
      renderMode,
      ohlcHalfSize,
      panOffset   : this._panOffsetCss,
      physW       : this._physW,
      physH       : this._physH,
      pixelRatio  : this._pixelRatio,
    })
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  destroy (): void {
    if (this._workerReady) {
      this._worker.postMessage({ type: 'destroy' })
    } else {
      this._worker.terminate()
    }
    this._canvas.remove()
  }

  // ---------------------------------------------------------------------------
  // Static capability check
  // ---------------------------------------------------------------------------

  static isSupported (): boolean {
    return (
      WebGLCanvas.isSupported() &&
      typeof OffscreenCanvas !== 'undefined' &&
      typeof Worker !== 'undefined'
    )
  }
}

// ---------------------------------------------------------------------------
// WeakMap cache — one CandleWorkerRenderer per widget instance
// ---------------------------------------------------------------------------
const _workerCache = new WeakMap<object, CandleWorkerRenderer>()

export function getOrCreateWorkerRenderer (
  widgetKey: object,
  container: HTMLElement
): CandleWorkerRenderer | null {
  if (!CandleWorkerRenderer.isSupported()) return null
  let r = _workerCache.get(widgetKey)
  if (r === undefined) {
    try {
      r = new CandleWorkerRenderer(container)
      _workerCache.set(widgetKey, r)
    } catch {
      return null
    }
  }
  return r
}

export function getWorkerRenderer (widgetKey: object): CandleWorkerRenderer | null {
  return _workerCache.get(widgetKey) ?? null
}

export function destroyWorkerRenderer (widgetKey: object): void {
  const r = _workerCache.get(widgetKey)
  if (r !== undefined) {
    r.destroy()
    _workerCache.delete(widgetKey)
  }
}
