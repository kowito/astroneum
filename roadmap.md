# Astroneum — Fastest Chart on Earth Roadmap

## Objective

Reach and sustain **sub-1ms frame time at 120 Hz** with 50 000+ bars, 10+ indicators,
and live tick streaming — outperforming TradingView, Lightweight Charts, and Highcharts
on every measurable axis: first paint, pan latency, memory pressure, and tick throughput.

---

## Current Baseline (as of v0.1.1)

All items below are **shipped**.

| Layer | Implementation | Status |
|---|---|---|
| Candle rendering | WebGPU → Worker WebGL2 → main-thread WebGL2 | ✅ |
| Instanced geometry | 1 `drawArraysInstanced` call, 32-byte packed VBO | ✅ |
| Pan bandwidth | O(1) uniform-only update (pan-offset + price range) | ✅ |
| VBO overscan | 64-bar pre-render buffer, skip re-upload on small pans | ✅ |
| LOD aggregation | Cap geometry at canvas-width buckets, sub-pixel cull | ✅ |
| Dirty-flag gate | `_vboVersion` / `_drawnVersion` — skip clear+draw on no change | ✅ |
| Color cache | Parse CSS color string once, reuse `[r,g,b,a]` floats | ✅ |
| Indicator rendering | SharedIndicatorGLCanvas — instanced WebGL2, shared context | ✅ |
| Rect rendering | `IndicatorRectWebGLRenderer` — instanced rects | ✅ |
| Grid lines | GPU via `IndicatorLineWebGLRenderer` — 1 draw call | ✅ |
| GPU text | Glyph atlas + `TextWebGLRenderer` — axis, labels, crosshair | ✅ |
| AA line rendering | GLSL ES 3.0 `fwidth()` fragment shader | ✅ |
| Layout scheduling | `requestAnimationFrame` gate — vsync-aligned, no mid-frame layouts | ✅ |
| Indicator calc debounce | `queueMicrotask` collapse — N burst calls → 1 round | ✅ |
| Idle deferral | `requestIdleCallback` for large dataset initial calc | ✅ |
| Tail-update | O(maxPeriod) incremental recalc on live tick (vs O(N) full) | ✅ |
| Font memoization | `createFont()` cached by size/weight/family | ✅ |
| `measureText` cache | Per-text per-font width cache, stable across pointer events | ✅ |
| Gradient cache | `CanvasGradient` reused until height/minY change | ✅ |
| Worker renderer | OffscreenCanvas + Blob Worker — `bufferSubData` off main thread | ✅ |
| WebGPU renderer | WGSL pipeline, UBO uniforms, indirect-ready | ✅ |

---

## Phase 1 — Zero-Copy & Worker Pool
> **Target: eliminate all main-thread VBO upload cost**

### P1-A. SharedArrayBuffer zero-copy VBO transfer
**Impact:** ★★★★★  
**Files:** `CandleWorkerRenderer.ts`, `candleShaders.ts`, `CandleBarView.ts`  
**Why:** `CandleWorkerRenderer` currently uses `structured-clone` to copy the staging
`ArrayBuffer` into the Worker via `postMessage`. At 50 000 bars × 32 B = 1.6 MB, this
is 1.6 MB memcpy per dirty frame even with the overscan fast path. `SharedArrayBuffer`
+ `Atomics` eliminates the copy entirely: the main thread packs into SAB; the worker
reads without transfer.  
**How:**
- Allocate `_sab = new SharedArrayBuffer(MAX_BARS * BYTES_PER_BAR)` once in
  `CandleWorkerRenderer` constructor; pass to worker at init.
- Main thread writes staging data into `new Float32Array(_sab)` + `new Uint8Array(_sab)`.
- Post `{ cmd: 'draw', barCount, drawStartOffset, visibleBarCount }` — no `transfer:`.
- Worker reads `Float32Array(sab)` directly, calls `gl.bufferSubData` with zero memcpy.
- Fallback: detect `crossOriginIsolated === false` and revert to transfer path.
- **Prerequisite:** set `Cross-Origin-Opener-Policy: same-origin` +
  `Cross-Origin-Embedder-Policy: require-corp` headers on the dev server.

---

### P1-B. Indicator Worker pool
**Impact:** ★★★★★  
**Files:** `src/engine/Store.ts`, new `src/engine/workers/IndicatorWorker.ts`  
**Why:** `requestIdleCallback` defers indicator calculation but it still runs on the main
thread, competing with compositor callbacks. A dedicated Worker pool moves all `.calc()`
calls off the main thread permanently, giving the renderer a fully uncontested rAF budget.  
**How:**
- Create `IndicatorWorkerPool` — fixed pool of `navigator.hardwareConcurrency / 2`
  workers (min 1, max 4).
- Serialize `dataList` slice as a `Float64Array` via SAB (timestamps + OHLCV = 6 × f64
  per bar); indicator params as a small structured-clone object.
- Workers run the indicator `calc()` function (pure math, no DOM), return result arrays.
- Main thread splices results into `indicator.result` and triggers a single `layout()`.
- Indicators with cross-bar state (Bollinger, MACD signal) require full SAB slice;
  tail-only indicators (SMA) can receive a `maxPeriod * 2` window.

---

### P1-C. `getCoalescedEvents()` pointer coalescing
**Impact:** ★★★☆☆  
**Files:** `src/engine/Event.ts`  
**Why:** On 120 Hz displays, `pointermove` events fire up to 120×/s but the browser
coalesces intermediate events into the dispatch queue. Without `getCoalescedEvents()`,
only the final position per rAF is processed — fine for latency, but crosshair and
overlay drawing skips positions. More importantly, calling `getCoalescedEvents()` tells
the browser the app has consumed all positions, allowing it to suppress redundant
synthetic moves.  
**How:** In the `mousemove` / `touchmove` handler in `Event.ts`, replace direct use of
`e.clientX/Y` with:
```ts
const events = (e as PointerEvent).getCoalescedEvents?.() ?? [e]
const last = events[events.length - 1]
// process last for crosshair position
```
Also call `(e as PointerEvent).getPredictedEvents?.()` for 1-frame speculative crosshair
position during fast moves.

---

### P1-D. Object pool for `BarRenderData`
**Impact:** ★★☆☆☆  
**Files:** `src/engine/view/CandleBarView.ts`  
**Why:** `barRenderData.push({ ... })` allocates a new object per bar per frame. At
50 000 bars this is 50 000+ short-lived objects that pressure the minor GC. A pre-
allocated ring pool avoids all per-frame heap allocation on the candle hot path.  
**How:**
- `class BarPool { private _pool: BarRenderData[]; alloc(); reset() }`.
- Pre-allocate `MAX_BARS` entries once; `alloc()` returns the next slot.
- Call `pool.reset()` at the start of each `drawImp` cycle.
- Use `barRenderData[i] = pool.alloc()` instead of `push({})`.

---

## Phase 2 — Native WebGPU Pipeline
> **Target: retire WebGL2, run the entire render graph on WebGPU**

### P2-A. Render bundles for static geometry
**Impact:** ★★★★☆  
**Files:** `src/engine/common/CandleWebGPURenderer.ts`, indicator GPU renderers  
**Why:** WebGPU `GPURenderBundle` pre-records draw commands into an immutable bundle
that the GPU driver can replay without re-validating state. For frames where only the
uniform (price range / pan offset) changes, the bundle replay costs ~0.1 ms vs ~0.8 ms
for a full command encoding. This is the WebGPU equivalent of display lists.  
**How:**
- On first `setData()`, encode a `GPURenderBundleEncoder` for the instanced draw and
  call `finish()` → `_bundle`.
- In `draw()`: if VBO is clean (version match), record only a `setBindGroup` + `executeBundles([_bundle])`.
- Invalidate (re-encode) when VBO content changes.

---

### P2-B. Compute shader LOD aggregation
**Impact:** ★★★★★  
**Files:** `src/engine/common/CandleWebGPURenderer.ts`, new `src/engine/workers/lodShader.wgsl`  
**Why:** Current LOD runs in JS: iterate all bars, bucket by screen X, compute
OHLCV aggregate per bucket. At 100 000 bars this is ~5 ms JS per LOD rebuild. A WebGPU
compute shader performs the same reduction in parallel on the GPU in ~0.1 ms, and the
aggregated result stays in GPU memory — no roundtrip to JS.  
**How:**
- Input: `GPUBuffer` containing all bars as `f32[6]` (timestamp, O, H, L, C, V).
- Dispatch: 1 workgroup per screen-pixel column; each workgroup reduces its bar range
  to a single `[O, H, L, C]` min/max aggregate.
- Output: `GPUBuffer` consumed directly as the instance vertex buffer for the render pass.
- JS only sets a `width` uniform and dispatches — no readback.

---

### P2-C. GPU-driven indirect draw
**Impact:** ★★★☆☆  
**Files:** `src/engine/common/CandleWebGPURenderer.ts`  
**Why:** `drawIndirect` / `drawIndexedIndirect` reads the instance count from a
`GPUBuffer` written by the compute shader (LOD aggregation above). This eliminates the
JS `device.queue.writeBuffer(uniformBuf, ...)` for instance count — the GPU updates the
indirect args directly.  
**How:** After compute LOD, write `[vertexCount, instanceCount, firstVertex, firstInstance]`
into an indirect args buffer. Replace `renderPass.draw(6, instanceCount)` with
`renderPass.drawIndirect(indirectBuf, 0)`.

---

### P2-D. Multi-pane single-pass rendering
**Impact:** ★★★☆☆  
**Files:** `src/engine/widget/IndicatorWidget.ts`, `src/engine/view/IndicatorView.ts`  
**Why:** Each pane currently has its own WebGL context / WebGPU device texture. For a
3-pane chart this is 3 `beginFrame()` + 3 `endFrame()` pairs. WebGPU allows multiple
render passes on a single `GPUCommandEncoder`, writing to different texture views in one
submit — halving driver overhead.  
**How:**
- Promote `SharedIndicatorGLCanvas` to a chart-level `SharedGPUCanvas` that owns a
  single `GPUDevice` + swap-chain texture.
- Each pane is a sub-region (scissor rect) of the shared texture.
- All panes encode into the same `GPUCommandEncoder`, submit once per frame.

---

## Phase 3 — WASM Compute
> **Target: SIMD-width indicator math, zero GC pressure**

### P3-A. WASM indicator calculator
**Impact:** ★★★★★  
**Files:** new `src/engine/workers/indicators.rs` (Rust) or `indicators.cpp` (C++)  
**Why:** JS floating-point arithmetic is ~4× slower than native SIMD for sliding-window
math. A Rust/WASM module with `#[target_feature(enable = "simd128")]` processes 4 f64
values per instruction. EMA of 10 000 bars drops from ~2 ms JS to ~0.15 ms WASM.  
**How:**
- Compile a Rust crate with `wasm-pack` exporting `fn calc_ema(data: &[f64], period: u32) -> Vec<f64>`.
- Pass `SharedArrayBuffer` OHLCV slice; receive result in a second SAB.
- Fall back to JS `calc()` when `WebAssembly` is unavailable.
- Bundle `.wasm` as an `asset` in `tsup.config.ts` via `esbuild --loader:.wasm=file`.

---

### P3-B. SIMD batch OHLCV packing
**Impact:** ★★★☆☆  
**Files:** `CandleWebGLRenderer.ts` staging loop, or WASM module  
**Why:** The staging loop that packs `[centerX, open, high, low, close, bodyColor...]`
into the `Float32Array` is a hot inner loop. WASM SIMD can pack 4 bars per instruction
via `f32x4.splat` / `v128.store`. This reduces the staging loop from ~2 ms to ~0.3 ms
at 50 000 bars.  
**How:**
- Export `fn pack_bars(bars_json_ptr, bars_len, out_f32_ptr)` from WASM.
- Main thread passes `BarRenderData[]` (copied to WASM linear memory), receives packed
  `Float32Array` view over WASM heap — no GC.

---

### P3-C. WASM ring buffer for live tick ingestion
**Impact:** ★★★☆☆  
**Files:** `src/engine/Store.ts`, WASM module  
**Why:** `_dataList.push(bar)` causes periodic array resizing. At 50 000 bars with 1-bar
tick rate = 50 000 pushes/session. A fixed-size circular buffer in WASM linear memory
avoids all heap resizing and lets the indicator worker read live data without copying.  
**How:**
- Allocate `SharedArrayBuffer` of `capacity * OHLCV_BYTES`; expose as ring buffer with
  head/tail `Atomics` counters.
- `appendData()` writes into the ring; indicator workers and the GPU staging loop
  read via SAB — truly zero-copy end-to-end.

---

## Phase 4 — Data Pipeline
> **Target: sub-1ms tick-to-pixel latency, offline-capable historical data**

### P4-A. WebTransport market data ingestion
**Impact:** ★★★★☆  
**Files:** new `src/datafeed/WebTransportDatafeed.ts`  
**Why:** WebSocket adds ~1 ms framing overhead per message. `WebTransport` over HTTP/3
(QUIC) provides unordered, unreliable datagrams for tick data — ideal for "latest price"
updates where drops are acceptable — at measured ~0.2 ms vs WebSocket's ~1.2 ms in
same-datacenter tests.  
**How:**
- Implement `WebTransportDatafeed` conforming to the existing `Datafeed` interface.
- Use unordered datagram stream for tick data; ordered reliable stream for OHLCV bars.
- Graceful fallback to WebSocket when `WebTransport` is unavailable.

---

### P4-B. FlatBuffers binary codec
**Impact:** ★★★☆☆  
**Files:** new `src/datafeed/codec/`, schema `bars.fbs`  
**Why:** JSON parsing + `JSON.parse` allocates a new object tree per message. FlatBuffers
provides zero-copy binary encoding: the wire bytes are directly memory-mapped as typed
arrays — no parse step, no allocation. A 1 000-bar historical response drops from
~2 ms JSON parse to ~0.02 ms FlatBuffers access.  
**How:**
- Define `bars.fbs` schema with `Bar { timestamp: int64; open/high/low/close: float32; volume: float64 }`.
- Generate TS accessors with `flatc --ts`.
- `DefaultDatafeed` accepts both JSON (backward compat) and FlatBuffers (new).

---

### P4-C. OPFS historical data cache
**Impact:** ★★★★☆  
**Files:** new `src/datafeed/OPFSCache.ts`  
**Why:** `Origin Private File System` (OPFS) provides synchronous file I/O from a Worker
at native-disk speed (~2 GB/s sequential read). Caching 50 000 bars as a binary blob in
OPFS means repeat visits skip the network entirely — initial chart paint in < 16 ms
instead of 500+ ms waiting for HTTP.  
**How:**
- `OPFSCache` worker: `navigator.storage.getDirectory()` → `FileSystemSyncAccessHandle`.
- Cache key: `${symbol}:${period}:${from}:${to}` → binary FlatBuffers file.
- On cache hit: read → decode → dispatch `onHistoryCallback` directly from Worker.
- TTL: 1 h for intraday data, 24 h for daily+.

---

### P4-D. Delta encoding for tick stream
**Impact:** ★★★☆☆  
**Files:** `src/datafeed/WebTransportDatafeed.ts` or `DefaultDatafeed.ts`  
**Why:** Broadcasting full OHLCV bars per tick wastes bandwidth. Ticks rarely change more
than 3–4 fields (close, volume, high/low only on new extremes). A 5-byte delta packet
(`fieldMask: u8, values: [u16]`) vs a 48-byte full bar is a 10× wire reduction at the
same semantic content. Fewer bytes → faster `TextDecoder` / memcpy → lower tick latency.  
**How:**
- Server sends `{ mask: 0b00101, close: 182.45, volume: 1234 }` encoded as 5 bytes.
- Client-side `applyDelta(bar, delta)` updates only masked fields.
- Compatible with existing `updateData()` path.

---

## Phase 5 — Platform & Scheduling
> **Target: always composited, never jank, pause when invisible**

### P5-A. `scheduler.postTask` priority queue
**Impact:** ★★★☆☆  
**Files:** `src/engine/Store.ts`, `src/engine/Chart.ts`  
**Why:** The Prioritized Task Scheduling API (`scheduler.postTask`) lets the browser
interleave tasks with rendering. Tick updates should be `user-blocking`; indicator
recalcs should be `background`. This prevents a burst of indicator jobs from stealing
rAF budget from the renderer.  
**How:**
```ts
scheduler.postTask(() => this._layout(), { priority: 'user-blocking' })
scheduler.postTask(() => this._calcIndicators(), { priority: 'background' })
```
Fallback: `queueMicrotask` / `requestIdleCallback` (already implemented).

---

### P5-B. `IntersectionObserver` render pause
**Impact:** ★★★☆☆  
**Files:** `src/engine/Chart.ts`, `src/chart/AstroneumChart.tsx`  
**Why:** A chart scrolled out of viewport continues running rAF, ticking indicators, and
uploading VBOs. `IntersectionObserver` fires when the chart enters/exits the viewport.
Pausing `_layoutPending` and suppressing `requestIdleCallback` when `intersectionRatio === 0`
eliminates ~100% of CPU/GPU work when the chart is off-screen.  
**How:**
```ts
const observer = new IntersectionObserver(([entry]) => {
  this._visible = entry.isIntersecting
}, { threshold: 0 })
observer.observe(this._container)
// In _layout(): if (!this._visible) return
```

---

### P5-C. `PerformanceObserver` adaptive quality
**Impact:** ★★★☆☆  
**Files:** `src/engine/common/CandleWebGLRenderer.ts`, `src/engine/Chart.ts`  
**Why:** On low-end devices the WebGPU / Worker path may still drop frames. A
`PerformanceObserver` watching `longtask` entries detects jank. When ≥ 3 long tasks
(> 50 ms) occur in 1 second, the renderer drops to a lower quality tier:
disable AA, reduce overscan, disable idle indicator calc.  
**How:**
```ts
const obs = new PerformanceObserver(list => {
  if (list.getEntries().length >= 3) this._qualityTier = 'low'
})
obs.observe({ entryTypes: ['longtask'] })
```
Expose as `Chart.setQualityTier('auto' | 'high' | 'low')`.

---

### P5-D. CSS `will-change: transform` for pane containers
**Impact:** ★★☆☆☆  
**Files:** `src/engine/pane/DrawPane.ts` (container element creation)  
**Why:** `will-change: transform` promotes the element to its own compositor layer, so
scroll-driven pan (CSS transform) does not trigger a raster repaint. For the overlay
canvas (crosshair, drawings) this allows pointer-event-driven movement to be
compositor-threaded at 120 Hz even when the main thread is busy.  
**How:** Set `container.style.willChange = 'transform'` on the overlay canvas element
and the crosshair pane container. Remove on `destroy()` to free compositor memory.

---

### P5-E. `ResizeObserver` debounce with `devicePixelRatio` change detection
**Impact:** ★★☆☆☆  
**Files:** `src/engine/Chart.ts`  
**Why:** Dragging a window between displays triggers `resize` events at every intermediate
`devicePixelRatio` value (1.0 → 1.25 → 1.5 → 2.0). Each resize rebuilds all GL textures
and reloads all VBOs. A 150 ms debounce + `devicePixelRatio` match check collapses the
burst into a single resize operation.  
**How:**
```ts
private _resizeTimer = 0
// In resize handler:
clearTimeout(this._resizeTimer)
this._resizeTimer = setTimeout(() => this._applyResize(), 150)
```

---

## Phase 6 — Benchmarking & Regression Prevention
> **Target: automated perf CI, no regressions ship**

### P6-A. `PerformanceMark` instrumented timing
**Files:** `src/engine/Chart.ts`, GPU renderers  
**Add marks:**
- `astroneum:frame-start` / `astroneum:frame-end` — full rAF cost
- `astroneum:vbo-upload` — staging + `bufferSubData` time
- `astroneum:indicator-calc` — indicator worker round-trip
- `astroneum:draw` — actual GPU draw call dispatch
Use `performance.measure()` to compute durations; expose via `Chart.getPerformanceMetrics()`.

---

### P6-B. WebGPU timestamp queries
**Files:** `src/engine/common/CandleWebGPURenderer.ts`  
**Why:** `PerformanceMark` measures CPU dispatch time, not actual GPU execution time.
`GPUQuerySet` timestamp queries measure true GPU start-to-end for each render pass.  
**How:**
```ts
const querySet = device.createQuerySet({ type: 'timestamp', count: 2 })
// in render pass descriptor: timestampWrites: { querySet, ... }
// readback via resolveQuerySet + mapAsync
```

---

### P6-C. Automated Playwright performance regression tests
**Files:** new `src/__tests__/perf/`  
**Why:** Without a CI gate, performance regressions silently ship. Playwright can drive
a headless Chrome with real GPU (via `--use-gl=egl`), perform 1 000-bar load +
200-bar pan, and assert that frame time stays below 16 ms (p99).  
**How:**
- `perf-baseline.test.ts`: measure `astroneum:frame-end - astroneum:frame-start` over
  100 frames; assert p99 < 16 ms, p50 < 4 ms.
- Run in CI with `--threshold` flag; fail build on ≥ 10% regression.

---

## Priority Summary

| Phase | Item | Impact | Effort | Priority |
|---|---|---|---|---|
| P1-A | SharedArrayBuffer zero-copy VBO | ★★★★★ | Medium | **P0** |
| P1-B | Indicator Worker pool | ★★★★★ | High | **P0** |
| P2-B | WebGPU compute LOD | ★★★★★ | High | **P0** |
| P3-A | WASM indicator calculator | ★★★★★ | High | **P1** |
| P4-C | OPFS historical cache | ★★★★☆ | Medium | **P1** |
| P2-A | WebGPU render bundles | ★★★★☆ | Medium | **P1** |
| P1-C | `getCoalescedEvents` | ★★★☆☆ | Low | **P2** |
| P1-D | BarRenderData object pool | ★★☆☆☆ | Low | **P2** |
| P5-A | `scheduler.postTask` | ★★★☆☆ | Low | **P2** |
| P5-B | IntersectionObserver pause | ★★★☆☆ | Low | **P2** |
| P5-C | Adaptive quality tier | ★★★☆☆ | Medium | **P2** |
| P4-A | WebTransport datafeed | ★★★★☆ | High | **P3** |
| P4-B | FlatBuffers codec | ★★★☆☆ | Medium | **P3** |
| P2-C | GPU indirect draw | ★★★☆☆ | Medium | **P3** |
| P2-D | Multi-pane single-pass | ★★★☆☆ | High | **P3** |
| P3-B | SIMD bar packing | ★★★☆☆ | Medium | **P3** |
| P3-C | WASM ring buffer | ★★★☆☆ | High | **P3** |
| P4-D | Delta tick encoding | ★★★☆☆ | Medium | **P3** |
| P5-D | `will-change: transform` | ★★☆☆☆ | Low | **P4** |
| P5-E | ResizeObserver debounce | ★★☆☆☆ | Low | **P4** |
| P6-A | PerformanceMark instrumentation | ★★★☆☆ | Low | **P4** |
| P6-B | WebGPU timestamp queries | ★★★☆☆ | Medium | **P4** |
| P6-C | Playwright perf regression CI | ★★★★☆ | Medium | **P4** |

---

## Performance Targets

| Metric | Current estimate | Target |
|---|---|---|
| First meaningful paint (10k bars) | ~120 ms | **< 16 ms** |
| Pan frame time (1-bar step, 1k bars visible) | ~2 ms | **< 0.5 ms** |
| Pan frame time (full overscan miss, 10k bars) | ~8 ms | **< 1 ms** |
| Tick-to-pixel latency (live tick, 10k bars, 3 indicators) | ~4 ms | **< 0.5 ms** |
| Memory at 50k bars + 5 indicators | ~80 MB | **< 30 MB** |
| CPU idle frame (no interaction) | ~1 ms rAF | **0 ms (skip gate)** |

---

## Competitive Reference Points

| Chart library | Candle render | Indicator calc | Live tick latency | Notes |
|---|---|---|---|---|
| **TradingView** | Canvas2D + native app | Worker pool | ~2 ms (est.) | Closed source, native desktop for heavy lifting |
| **Lightweight Charts** | Canvas2D | JS main thread | ~5 ms | Fast but 2D only, no GPU |
| **Highcharts Stock** | SVG + Canvas2D | JS main thread | ~15 ms | General purpose |
| **Astroneum v0.1.1** | WebGPU/WebGL2/Worker | queueMicrotask + rIC | ~4 ms | GPU-native from the start |
| **Astroneum (roadmap target)** | WebGPU compute + render bundles | WASM SIMD Worker pool | **< 0.5 ms** | Beyond TradingView web |
