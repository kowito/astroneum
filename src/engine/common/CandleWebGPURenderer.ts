/**
 * CandleWebGPURenderer — WebGPU candle renderer.
 *
 * Architecture
 * ────────────
 * Mirrors the full CandleWebGLRenderer feature set in the WebGPU API:
 *   • Same 32-byte packed per-instance buffer layout (5 × f32 + 3 × u8×4)
 *   • Same 18-vertex WGSL vertex shader expanding OHLC + Candle quads
 *   • Same LOD aggregation, O(1) fingerprint, pan-offset optimisation
 *   • GPUQueue.writeBuffer replaces gl.bufferSubData
 *   • Single instanced draw call (drawPrimitives triangles×18 × barCount)
 *
 * Capability gate: `CandleWebGPURenderer.isSupported()` is an async static that
 * resolves to `true` only when `navigator.gpu.requestAdapter()` succeeds.
 * Use the synchronous `_gpuSupported` module-level cache after the first probe.
 *
 * Fallback order (CandleBarView):
 *   CandleWebGPURenderer → CandleWorkerRenderer → CandleWebGLRenderer → Canvas2D
 */

import { getPixelRatio } from './utils/canvas'
import {
  BYTES_PER_BAR, COLOR_BYTE_OFF, VERTS_PER_BAR,
  parseColor
} from './candleShaders'
import type { BarRenderData } from './CandleWebGLRenderer'

// ── WGSL shader source (one module, two entry points) ──────────────────────

const WGSL_SRC = /* wgsl */`
struct Uniforms {
  priceFrom    : f32,
  priceRange   : f32,
  resolutionX  : f32,
  resolutionY  : f32,
  pixelRatio   : f32,
  barHalfWidth : f32,
  renderMode   : u32,  // 0 = candle, 1 = ohlc
  ohlcHalfSize : f32,
  panOffset    : f32,
}

@group(0) @binding(0) var<uniform> u : Uniforms;

struct InstanceIn {
  @location(0) centerX     : f32,
  @location(1) open        : f32,
  @location(2) high        : f32,
  @location(3) low         : f32,
  @location(4) close       : f32,
  @location(5) wickColor   : vec4<f32>,  // normalised [0,1]
  @location(6) bodyColor   : vec4<f32>,
  @location(7) borderColor : vec4<f32>,
}

struct VertOut {
  @builtin(position) pos   : vec4<f32>,
  @location(0)       color : vec4<f32>,
}

// Unit-quad vertex for a 2-triangle (6-vert) quad.
fn unitQuad(id: u32) -> vec2<f32> {
  switch id {
    case 0u: { return vec2(0.0, 0.0); }
    case 1u: { return vec2(1.0, 0.0); }
    case 2u: { return vec2(0.0, 1.0); }
    case 3u: { return vec2(0.0, 1.0); }
    case 4u: { return vec2(1.0, 0.0); }
    default: { return vec2(1.0, 1.0); }
  }
}

fn priceToPhysY(price: f32) -> f32 {
  let rate = (price - u.priceFrom) / u.priceRange;
  return (1.0 - rate) * u.resolutionY;
}

fn physToNdc(x: f32, y: f32) -> vec4<f32> {
  return vec4(
    x / u.resolutionX * 2.0 - 1.0,
    1.0 - y / u.resolutionY * 2.0,
    0.0, 1.0
  );
}

@vertex
fn vs_main(inst: InstanceIn, @builtin(vertex_index) vid: u32) -> VertOut {
  let isWick      = vid < 6u;
  let isBodyOuter = vid >= 6u && vid < 12u;

  let localId = select(select(vid - 12u, vid - 6u, vid < 12u), vid, vid < 6u);
  let unit    = unitQuad(localId);

  let highY  = priceToPhysY(inst.high);
  let lowY   = priceToPhysY(inst.low);
  let openY  = priceToPhysY(inst.open);
  let closeY = priceToPhysY(inst.close);

  let pr  = u.pixelRatio;
  let cx  = (inst.centerX + u.panOffset) * pr;
  let bhw = u.barHalfWidth * pr;

  var screenX : f32;
  var screenY : f32;
  var color   : vec4<f32>;

  if u.renderMode == 1u {
    // OHLC mode
    let ohw   = u.ohlcHalfSize * pr;
    let tickH = ohw * 2.0;
    if isWick {
      screenX = cx - ohw + unit.x * ohw * 2.0;
      screenY = highY + (lowY - highY) * unit.y;
      color   = inst.bodyColor;
    } else if isBodyOuter {
      let left  = cx - bhw;
      let right = cx - ohw;
      screenX = left + unit.x * max(right - left, 0.0);
      screenY = openY + unit.y * tickH;
      color   = inst.bodyColor;
    } else {
      let left  = cx + ohw;
      let right = cx + bhw;
      screenX = left + unit.x * max(right - left, 0.0);
      screenY = closeY + unit.y * tickH;
      color   = inst.bodyColor;
    }
  } else {
    // Candle mode (solid / stroke)
    var bodyTop    = min(openY, closeY);
    var bodyBottom = max(openY, closeY);
    bodyBottom     = max(bodyBottom, bodyTop + 1.0);

    if isWick {
      screenX = cx - 0.5 + unit.x;
      screenY = highY + (lowY - highY) * unit.y;
      color   = inst.wickColor;
    } else if isBodyOuter {
      screenX = cx - bhw + unit.x * bhw * 2.0;
      screenY = bodyTop + (bodyBottom - bodyTop) * unit.y;
      color   = inst.borderColor;
    } else {
      let inset   = 1.0;
      let innerHW = max(bhw - inset, 0.5);
      screenX = cx - innerHW + unit.x * innerHW * 2.0;
      let innerTop    = bodyTop + inset;
      let innerBottom = max(bodyBottom - inset, innerTop);
      screenY = innerTop + (innerBottom - innerTop) * unit.y;
      color   = inst.bodyColor;
    }
  }

  return VertOut(physToNdc(screenX, screenY), color);
}

@fragment
fn fs_main(@location(0) color: vec4<f32>) -> @location(0) vec4<f32> {
  return color;
}
`

// ── Module-level capability cache ────────────────────────────────────────────
// Resolved asynchronously once; subsequent calls return immediately.
let _gpuSupportChecked = false
let _gpuSupported = false
let _gpuSupportPromise: Promise<boolean> | null = null

async function _checkGpuSupport (): Promise<boolean> {
  if (_gpuSupportChecked) return _gpuSupported
  if (_gpuSupportPromise !== null) return _gpuSupportPromise
  _gpuSupportPromise = (async (): Promise<boolean> => {
    try {
      if (!('gpu' in navigator)) return false
      const adapter = await navigator.gpu.requestAdapter()
      _gpuSupported = adapter !== null
    } catch {
      _gpuSupported = false
    }
    _gpuSupportChecked = true
    return _gpuSupported
  })()
  return _gpuSupportPromise
}

// ── Per-widget factory (same pattern as CandleWebGLRenderer) ─────────────────
const _renderers = new WeakMap<object, CandleWebGPURenderer>()

export function getWebGPURenderer (key: object): CandleWebGPURenderer | null {
  return _renderers.get(key) ?? null
}

export async function getOrCreateWebGPURenderer (
  key: object,
  container: HTMLElement
): Promise<CandleWebGPURenderer | null> {
  const existing = _renderers.get(key)
  if (existing !== undefined) return existing
  try {
    const renderer = await CandleWebGPURenderer.create(container)
    _renderers.set(key, renderer)
    return renderer
  } catch {
    return null
  }
}

export function destroyWebGPURenderer (key: object): void {
  const r = _renderers.get(key)
  if (r !== undefined) {
    r.destroy()
    _renderers.delete(key)
  }
}

// ── Renderer ──────────────────────────────────────────────────────────────────

/**
 * Uniform buffer layout (9 × f32 + 1 × u32 = 40 bytes, padded to 48).
 *
 *  offset  0: priceFrom   (f32)
 *  offset  4: priceRange  (f32)
 *  offset  8: resolutionX (f32)
 *  offset 12: resolutionY (f32)
 *  offset 16: pixelRatio  (f32)
 *  offset 20: barHalfWidth(f32)
 *  offset 24: renderMode  (u32)
 *  offset 28: ohlcHalfSize(f32)
 *  offset 32: panOffset   (f32)
 *  offset 36: (padding)
 */
const UBO_SIZE = 48

export class CandleWebGPURenderer {
  private readonly _canvas: HTMLCanvasElement
  private readonly _context: GPUCanvasContext
  private readonly _device: GPUDevice
  private readonly _pipeline: GPURenderPipeline
  private readonly _uniformBuffer: GPUBuffer
  private readonly _uniformBindGroup: GPUBindGroup

  // Per-frame vertex/instance buffers — grow as needed (never shrink).
  private _instanceBuffer: GPUBuffer | null = null
  private _instanceCapacity = 0

  // CPU staging buffers — same packed layout as WebGL path.
  private _stagingBuf: ArrayBuffer = new ArrayBuffer(512 * BYTES_PER_BAR)
  private _stagingF32: Float32Array = new Float32Array(this._stagingBuf)
  private _stagingU8:  Uint8Array   = new Uint8Array(this._stagingBuf)

  private readonly _singleBarBuf = new ArrayBuffer(BYTES_PER_BAR)
  private readonly _singleBarF32 = new Float32Array(this._singleBarBuf)
  private readonly _singleBarU8  = new Uint8Array(this._singleBarBuf)

  // Pre-allocated uniform data — avoids a new Float32Array every draw() call.
  private readonly _uniformData = new Float32Array(UBO_SIZE / 4)

  // Color parse cache
  private readonly _colorCache = new Map<string, readonly [number, number, number, number]>()

  // Dirty / fingerprint state (identical logic to WebGL path)
  private _barCount = 0
  private _fingerprintBarCount = -1
  private _fingerprintFirstX = 0
  private _fingerprintLastX = 0
  private _fingerprintLastClose = 0
  private _fingerprintLastBodyColor = ''
  private _fingerprintFirstOpen = NaN
  private _fingerprintFirstClose = NaN
  private _fingerprintBarStep = 0
  private _panOffsetCss = 0

  private _vboVersion   = 0
  private _drawnVersion = -1
  private _lastPriceFrom    = NaN
  private _lastPriceRange   = NaN
  private _lastBarHalfWidth = NaN
  private _lastRenderMode   = -1
  private _lastOhlcHalfSize = NaN

  private _canvasWidthCss = 0
  private _lodActive = false
  private readonly _lodBuf: BarRenderData[] = []

  // Private constructor — use `CandleWebGPURenderer.create()`.
  private constructor (
    canvas: HTMLCanvasElement,
    context: GPUCanvasContext,
    device: GPUDevice,
    pipeline: GPURenderPipeline,
    uniformBuffer: GPUBuffer,
    uniformBindGroup: GPUBindGroup
  ) {
    this._canvas          = canvas
    this._context         = context
    this._device          = device
    this._pipeline        = pipeline
    this._uniformBuffer   = uniformBuffer
    this._uniformBindGroup = uniformBindGroup
  }

  /** Async factory — requests adapter + device, compiles pipeline. */
  static async create (container: HTMLElement): Promise<CandleWebGPURenderer> {
    if (!('gpu' in navigator)) throw new Error('[CandleWebGPURenderer] WebGPU not supported')
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
    if (adapter === null) throw new Error('[CandleWebGPURenderer] No GPU adapter found')
    const device = await adapter.requestDevice()

    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'position:absolute;top:0;left:0;z-index:1;pointer-events:none;'
    container.appendChild(canvas)

    const gpuCtx = canvas.getContext('webgpu') as GPUCanvasContext | null
    if (gpuCtx === null) throw new Error('[CandleWebGPURenderer] Cannot get WebGPU canvas context')

    const format = navigator.gpu.getPreferredCanvasFormat()
    gpuCtx.configure({
      device,
      format,
      alphaMode: 'premultiplied'
    })

    // Uniform buffer
    const uniformBuffer = device.createBuffer({
      size: UBO_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    })

    // Bind group layout
    const bindGroupLayout = device.createBindGroupLayout({
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform' }
      }]
    })

    const uniformBindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }]
    })

    // Shader module
    const shaderModule = device.createShaderModule({ code: WGSL_SRC })

    // Vertex buffer layout — same packed 32-byte stride as WebGL path
    const vertexBufferLayout: GPUVertexBufferLayout = {
      arrayStride: BYTES_PER_BAR,
      stepMode: 'instance',
      attributes: [
        { shaderLocation: 0, offset:  0, format: 'float32' },   // centerX
        { shaderLocation: 1, offset:  4, format: 'float32' },   // open
        { shaderLocation: 2, offset:  8, format: 'float32' },   // high
        { shaderLocation: 3, offset: 12, format: 'float32' },   // low
        { shaderLocation: 4, offset: 16, format: 'float32' },   // close
        { shaderLocation: 5, offset: 20, format: 'unorm8x4' },  // wickColor   (normalised)
        { shaderLocation: 6, offset: 24, format: 'unorm8x4' },  // bodyColor
        { shaderLocation: 7, offset: 28, format: 'unorm8x4' }   // borderColor
      ]
    }

    const pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [vertexBufferLayout]
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{
          format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one',        dstFactor: 'one-minus-src-alpha', operation: 'add' }
          }
        }]
      },
      primitive: { topology: 'triangle-list' }
    })

    return new CandleWebGPURenderer(canvas, gpuCtx, device, pipeline, uniformBuffer, uniformBindGroup)
  }

  // ── Capability check ──────────────────────────────────────────────────────

  /** Async: resolves `true` only when a WebGPU adapter is available. */
  static async isSupported (): Promise<boolean> {
    return _checkGpuSupport()
  }

  // ── Resize ────────────────────────────────────────────────────────────────

  resize (width: number, height: number): void {
    if (this._canvasWidthCss === width && this._canvas.style.width === `${width}px`) return
    this._canvasWidthCss = width
    const pr = getPixelRatio(this._canvas)
    const pw = Math.round(width  * pr)
    const ph = Math.round(height * pr)
    if (this._canvas.width === pw && this._canvas.height === ph) return
    this._canvas.width  = pw
    this._canvas.height = ph
    this._canvas.style.width  = `${width}px`
    this._canvas.style.height = `${height}px`
    this._vboVersion++  // dimension reset → must re-render
  }

  // ── Colour helpers ────────────────────────────────────────────────────────

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

  // ── LOD ───────────────────────────────────────────────────────────────────

  private _applyLod (rawBars: BarRenderData[], targetCount: number): void {
    while (this._lodBuf.length < targetCount) {
      this._lodBuf.push({ centerX: 0, open: 0, high: 0, low: 0, close: 0,
        wickColor: '', bodyColor: '', borderColor: '' })
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
        if (rawBars[j].high > high) high = rawBars[j].high
        if (rawBars[j].low  < low)  low  = rawBars[j].low
      }
      const out = this._lodBuf[i]
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

  // ── GPU buffer management ─────────────────────────────────────────────────

  private _ensureInstanceBuffer (count: number): GPUBuffer {
    if (this._instanceBuffer !== null && count <= this._instanceCapacity) {
      return this._instanceBuffer
    }
    const newCap = Math.max(count, this._instanceCapacity * 2, 512)
    this._instanceBuffer?.destroy()
    // Align to 4 bytes (WebGPU requirement)
    const byteSize = newCap * BYTES_PER_BAR
    this._instanceBuffer = this._device.createBuffer({
      size: (byteSize + 3) & ~3,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    })
    this._instanceCapacity = newCap
    // Grow CPU staging buffers in lock-step
    this._stagingBuf = new ArrayBuffer(newCap * BYTES_PER_BAR)
    this._stagingF32 = new Float32Array(this._stagingBuf)
    this._stagingU8  = new Uint8Array(this._stagingBuf)
    return this._instanceBuffer
  }

  // ── Data upload ───────────────────────────────────────────────────────────

  /**
   * Full VBO upload — same fingerprint / LOD / pan-offset logic as the WebGL path.
   */
  setData (rawBars: BarRenderData[]): void {
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

    // O(1) fingerprint — identical to WebGL path
    if (
      visibleBarCount     === this._fingerprintBarCount     &&
      firstBar.centerX    === this._fingerprintFirstX       &&
      lastBar.centerX     === this._fingerprintLastX        &&
      lastBar.close       === this._fingerprintLastClose    &&
      lastBar.bodyColor   === this._fingerprintLastBodyColor
    ) return

    const currentBarStep = visibleBarCount >= 2
      ? bars[1].centerX - firstBar.centerX
      : this._fingerprintBarStep
    // Pure pan → update only pan offset uniform
    if (
      visibleBarCount     === this._fingerprintBarCount      &&
      lastBar.close       === this._fingerprintLastClose     &&
      lastBar.bodyColor   === this._fingerprintLastBodyColor &&
      firstBar.open       === this._fingerprintFirstOpen     &&
      firstBar.close      === this._fingerprintFirstClose    &&
      currentBarStep      === this._fingerprintBarStep
    ) {
      this._panOffsetCss += firstBar.centerX - this._fingerprintFirstX
      this._fingerprintFirstX = firstBar.centerX
      this._fingerprintLastX  = lastBar.centerX
      this._vboVersion++
      return
    }

    // Full re-upload
    this._panOffsetCss              = 0
    this._fingerprintBarCount       = visibleBarCount
    this._fingerprintFirstX         = firstBar.centerX
    this._fingerprintLastX          = lastBar.centerX
    this._fingerprintLastClose      = lastBar.close
    this._fingerprintLastBodyColor  = lastBar.bodyColor
    this._fingerprintFirstOpen      = firstBar.open
    this._fingerprintFirstClose     = firstBar.close
    this._fingerprintBarStep        = currentBarStep

    this._ensureInstanceBuffer(visibleBarCount)

    const f32 = this._stagingF32
    const u8  = this._stagingU8
    for (let i = 0; i < visibleBarCount; i++) {
      this._writeBarIntoViews(bars[i], f32, u8, i << 3, i * BYTES_PER_BAR)
    }

    this._device.queue.writeBuffer(
      this._instanceBuffer!,
      0,
      this._stagingBuf,
      0,
      visibleBarCount * BYTES_PER_BAR
    )
    this._vboVersion++
  }

  /**
   * O(1) partial update for the live tick.  No-op when LOD is active.
   */
  updateLastBar (bar: BarRenderData): void {
    if (this._barCount === 0 || this._lodActive || this._instanceBuffer === null) return
    this._fingerprintLastClose = bar.close
    this._writeBarIntoViews(bar, this._singleBarF32, this._singleBarU8, 0, 0)
    this._device.queue.writeBuffer(
      this._instanceBuffer,
      (this._barCount - 1) * BYTES_PER_BAR,
      this._singleBarBuf
    )
    this._vboVersion++
  }

  // ── Render ────────────────────────────────────────────────────────────────

  draw (
    priceFrom: number,
    priceRange: number,
    barHalfWidth: number,
    renderMode = 0,
    ohlcHalfSize = 0
  ): void {
    if (this._barCount === 0 || this._instanceBuffer === null) return

    // Incremental dirty gate — same logic as WebGL path
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

    const pr = getPixelRatio(this._canvas)
    const pw = this._canvas.width
    const ph = this._canvas.height

    // Write uniform buffer (float32 layout matching the WGSL struct)
    this._uniformData[0] = priceFrom
    this._uniformData[1] = priceRange
    this._uniformData[2] = pw
    this._uniformData[3] = ph
    this._uniformData[4] = pr
    this._uniformData[5] = barHalfWidth
    this._uniformData[6] = renderMode as unknown as number  // reinterpreted as u32 in WGSL
    this._uniformData[7] = ohlcHalfSize
    this._uniformData[8] = this._panOffsetCss
    this._device.queue.writeBuffer(this._uniformBuffer, 0, this._uniformData)

    const commandEncoder = this._device.createCommandEncoder()
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: this._context.getCurrentTexture().createView(),
        loadOp: 'clear',
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        storeOp: 'store'
      }]
    })

    renderPass.setPipeline(this._pipeline)
    renderPass.setBindGroup(0, this._uniformBindGroup)
    renderPass.setVertexBuffer(0, this._instanceBuffer)
    renderPass.draw(VERTS_PER_BAR, this._barCount, 0, 0)
    renderPass.end()

    this._device.queue.submit([commandEncoder.finish()])
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  destroy (): void {
    this._instanceBuffer?.destroy()
    this._uniformBuffer.destroy()
    this._canvas.remove()
  }
}
