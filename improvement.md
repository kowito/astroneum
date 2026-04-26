# GPU Rendering Improvements

Ordered by impact and implementation cost.  
Items marked **[DONE]** are committed. Items marked **[IMPL]** are implemented in this batch.

---

## Batch 1 — Implemented this session

### [IMPL] 1. Scissor test per pane
**Files:** `CandleWebGLRenderer`, `IndicatorLineWebGLRenderer`, `IndicatorRectWebGLRenderer`  
**Why:** `gl.SCISSOR_TEST` causes the GPU to reject any fragment outside the scissor rectangle before executing the fragment shader. For thick indicator lines whose expanded quads slightly overhang the canvas edge, this eliminates the shader invocations for those invisible fragments. In multi-pane layouts the cumulative saving compounds across each pane redraw.  
**How:** `gl.enable(gl.SCISSOR_TEST)` once in each renderer constructor; `gl.scissor(0, 0, w, h)` before `gl.clear()` in each `draw()`.

### [IMPL] 2. Explicit depth test disable
**Files:** `CandleWebGLRenderer`, `IndicatorLineWebGLRenderer`, `IndicatorRectWebGLRenderer`  
**Why:** Some GPU drivers silently enable depth testing. An explicit `gl.disable(gl.DEPTH_TEST)` removes the per-fragment depth read/write overhead on those drivers and makes the state machine intent unambiguous (all our geometry is 2-D and intentionally drawn in submission order).

### [IMPL] 3. Deduplicate WebGL2 support probe
**Files:** `CandleWebGLRenderer`, `IndicatorLineWebGLRenderer`, `IndicatorRectWebGLRenderer`  
**Why:** Each renderer has its own module-level IIFE that spins up a throwaway `webgl2` canvas context to check support. Three separate probes means three extra `getContext` calls and three extra context slots consumed at module load. `WebGLCanvas.isSupported()` already performs exactly this probe and caches the result — reuse it everywhere.  
**How:** Remove `_webgl2Supported` / `_rectGL2Supported` / `_lineGL2Supported` IIFEs; import and call `WebGLCanvas.isSupported()`.

### [IMPL] 4. Remove dead `width`/`height` params from indicator renderer `draw()`
**Files:** `IndicatorLineWebGLRenderer`, `IndicatorRectWebGLRenderer`, `IndicatorView`  
**Why:** Both `draw(width, height)` methods ignore their parameters entirely — the canvas dimensions are always read from `this._canvas.width/height` which `resize()` keeps current. The dead params cause confusion about which source-of-truth is authoritative and generate implicit lint noise.  
**How:** Drop params to `draw()`, update the two call sites in `IndicatorView`.

---

## Batch 2 — Next implementation targets

### [IMPL] 5. Shared WebGL canvas per indicator pane (`SharedIndicatorGLCanvas`)
**Files:** new `SharedIndicatorGLCanvas.ts`, `IndicatorLineWebGLRenderer`, `IndicatorRectWebGLRenderer`, `IndicatorView`, `IndicatorWidget`  
**Why:** Previously each renderer created its own `<canvas>` + `WebGL2RenderingContext`. A chart with N panes × 3 indicator renderers = 3N contexts, quickly approaching the browser cap of ~16. Indicator sub-panes now share ONE context.
**How:**
- `SharedIndicatorGLCanvas` owns the single `<canvas>` + `WebGL2RenderingContext` per widget. Sets global GL state once (blend, depth, scissor).
- `beginFrame()` clears the canvas and sets viewport/scissor — called once per dirty frame, before any renderer draws.
- `resize()` is idempotent; increments `sizeVersion` when dimensions change.
- Both renderers hold only a VAO / VBO / program. `isDirty()` = VBO version stale OR canvas resized since last draw.
- `IndicatorView` two-pass protocol: `setData()` → check `anyDirty` → if dirty: `beginFrame()` then both `draw()` in rect-under-lines order. Clean frames skip all GL calls and preserve the canvas content from the prior frame.
- Destruction order: line/rect `destroy()` (free GPU objects) → `destroySharedIndicatorGLCanvas()` (lose context + remove canvas).

### [IMPL] 5a. Apply batch-1 fixes to `IndicatorPluginWebGLRenderer` (previously missed)
**Files:** `IndicatorPluginWebGLRenderer`  
**Why:** The plugin renderer was skipped in batch 1. It still had its own `_pluginGL2Supported` IIFE, was missing `gl.disable(gl.DEPTH_TEST)` and `gl.enable(gl.SCISSOR_TEST)`, and `beginFrame()` was missing the `gl.scissor()` call.
**How:** Add depth-disable + scissor-enable in constructor; add `gl.scissor(0, 0, w, h)` in `beginFrame()`; replace IIFE with `WebGLCanvas.isSupported()`.

### [IMPL] 6. OffscreenCanvas + Web Worker
**Impact:** ★★★★★  
Move candle renderer GPU commands into a `CandleWorkerRenderer`. Main thread handles LOD + colour parsing + staging-buffer pack. Worker owns the OffscreenCanvas and runs `gl.bufferSubData + gl.drawArraysInstanced` off the main thread — eliminates main-thread GL-driver stalls during fast scroll/zoom while a tooltip is updating.  
**Implemented:** `candleShaders.ts` (shared constants + fixed OHLC shader bug), `CandleWorkerRenderer.ts` (blob-URL worker, same fingerprint/pan/LOD API as `CandleWebGLRenderer`), `CandleBarView.ts` (tries worker first, falls back to main-thread GL), `CandleWidget.ts` (destroys both renderer types on cleanup). Structured-clone upload keeps staging buffer intact on main thread.

### [IMPL] 7. GPU text / SDF glyph atlas
**Impact:** ★★★☆☆  
Price labels, axis tick text, and tooltip numbers are currently `Canvas2D.fillText()` per tick. Pre-render all needed glyphs into a `gl.LUMINANCE` texture atlas; render text quads sampling the atlas. Result: sub-pixel-smooth text at any DPI, zero `fillText` calls in the render loop.  
**Implemented:** `GlyphAtlas.ts` (RGBA atlas at 2× RENDER_SCALE via off-screen Canvas2D), `TextWebGLRenderer.ts` (owns a `<canvas>` at z-index 3; instanced TRIANGLE_STRIP quads; two-phase `beginMainFrame`/`beginOverlayFrame`/`flush` lifecycle; per-renderer atlas cache keyed by fontSize+family), `DrawWidget.ts` (creates renderer, wraps canvas listeners, exposes `getTextRenderer()`/`queueText()`, resizes and destroys on teardown), `AxisView.ts` (routes tick-label `TextAttrs` through `tr.queue()` when GL is available; Canvas2D fallback otherwise).

### [IMPL] 8. WebGPU path
**Impact:** ★★★☆☆ (browser support ~75 % as of 2026)  
WebGPU eliminates the implicit draw-state tracking overhead of the WebGL driver. WGSL shaders compile faster; the explicit command-buffer model reduces CPU time by 2–3× vs WebGL2 at equal draw-call count.  
**Implemented:** `CandleWebGPURenderer.ts` — WGSL port of all vertex/fragment logic (18-vert instanced draw, candle + OHLC modes, pan-offset uniform, same LOD/fingerprint/dirty-gate as WebGL path); `GPUQueue.writeBuffer` replaces `gl.bufferSubData`; async `create()` factory + `isSupported()` probe; same external API (`setData`, `updateLastBar`, `resize`, `draw`, `destroy`). `CandleBarView.ts` updated to try WebGPU first (fire-and-forget async init, falls through to Worker/WebGL2 on the first frame). `CandleWidget.ts` calls `destroyWebGPURenderer` on teardown.

---

## Batch 3 — Next implementation targets

### [IMPL] 9. Pre-allocate `_uniformData` in `CandleWebGPURenderer`
**Impact:** ★★★☆☆  
**Files:** `src/engine/common/CandleWebGPURenderer.ts`  
**Why:** `draw()` currently executes `const uData = new Float32Array(UBO_SIZE / 4)` on every render frame — allocating 9 × 4 = 36 bytes and triggering a minor GC each time. In the WebGPU path this is the primary remaining hot-path allocation.  
**How:**
- Add a private field `private readonly _uniformData = new Float32Array(UBO_SIZE / 4)` to `CandleWebGPURenderer`.
- Replace the local `const uData = new Float32Array(UBO_SIZE / 4)` in `draw()` with writes to `this._uniformData`.
- Pass `this._uniformData` to `device.queue.writeBuffer`.

---

### [IMPL] 10. Wire `TextWebGLRenderer` to per-frame price labels
**Impact:** ★★★★☆  
**Files:** `src/engine/view/CandleLastPriceLabelView.ts`, `src/engine/view/CandleHighLowPriceView.ts`, `src/engine/view/IndicatorLastValueView.ts`  
**Why:** These three views draw text on every frame (last price badge, high/low markers, indicator last value). They still call `createFigure('text')` → Canvas2D `fillText`. Because `DrawWidget.getTextRenderer()` already exists and `AxisView` already uses it, wiring these three views costs minimal additional infrastructure.  
**Architecture:**
- Each view receives its widget's `TextWebGLRenderer` (via `getTextRenderer()` from the containing `DrawWidget`).
- If a renderer is available, call `tr.queue(text, x, y, style)` instead of `createFigure('text')`.
- If the renderer is `null` (WebGL2 not available), keep the existing `createFigure` fallback path unchanged.
- The renderer's `flush()` is already called by `DrawWidget` at the end of each frame, so the views need only queue — no lifecycle changes needed.
**Scope constraints:**
- `CandleLastPriceLabelView` — price text + optional bid/ask labels.
- `CandleHighLowPriceView` — high and low price annotations (two text figures per bar range).
- `IndicatorLastValueView` — each indicator's last numeric value displayed at y-axis edge.

---

### [IMPL] 11. Wire `TextWebGLRenderer` to crosshair price/time labels
**Impact:** ★★★☆☆  
**Files:** `src/engine/view/CrosshairHorizontalLabelView.ts`, `src/engine/view/CrosshairVerticalLabelView.ts`  
**Why:** These labels redraw on every `mousemove` event. `CrosshairHorizontalLabelView` already computes `ctx.font` + `ctx.measureText` before delegating to `createFigure('text')`. Routing to `TextWebGLRenderer` removes both the `measureText` call and the Canvas2D state switch on every pointer event.  
**How:** Same pattern as item 10 — gate on `getTextRenderer()` being non-null; queue the single text item; Canvas2D fallback when GL is absent. The `getTextAttrs()` position calc stays unchanged (still needed for hit testing and label box clipping).

---

### [IMPL] 12. `IndicatorView` Canvas2D fallback hardening
**Impact:** ★★☆☆☆  
**Files:** `src/engine/view/IndicatorView.ts`  
**Why:** The current Canvas2D fallback (inside `else if (hasGpuIndicators)`) iterates `gpuRects` and `gpuLineSegs` with two separate loops. There is no call to `ctx.save()` / `ctx.restore()` around the stroke path, so a `ctx.lineWidth` or `ctx.strokeStyle` left set by a previous segment leaks into subsequent draws when the fallback path is hit (e.g., on Safari where WebGL2 is absent).  
**How:**
- Wrap the entire Canvas2D fallback block in `ctx.save()` … `ctx.restore()`.
- Move `ctx.beginPath()` inside the line loop (before `ctx.moveTo`) so paths don't accumulate across segments.
- Add `ctx.closePath()` is not needed — just ensure `ctx.stroke()` is called per segment.

---

## Already implemented (prior sessions)

| Feature | Commit |
|---|---|
| Instanced rendering — 1 draw call for all bars | earlier |
| Packed 32-byte VBO (5 floats + 3 × UByte4 colors) | earlier |
| GPU price→Y coordinate transform via uniforms | earlier |
| Pan-offset uniform — O(1) bandwidth on pure pan | earlier |
| Dirty-flag VBO fingerprint (5 scalar compares) | earlier |
| Color cache — no CSS color re-parse per frame | earlier |
| `EXT_disjoint_timer_query_webgl2` GPU timer (dev) | earlier |
| LOD aggregation — cap geometry at canvas-width buckets | earlier |
| Sub-pixel culling — skip segments/rects < 0.5 px | earlier |
| Incremental dirty tracking (`_vboVersion` gate) | d97d05c |
| `fwidth()`-based AA lines in fragment shader | d97d05c |
