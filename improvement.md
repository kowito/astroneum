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

---

## Batch 4

### [IMPL] 13. `queueMicrotask` debounce for burst `_calcIndicator` calls
**Impact:** ★★★★☆  
**Files:** `src/engine/Store.ts`  
**Why:** When `appendData()` is called N times synchronously (e.g. bulk historical load or replay fill), `_calcIndicator` fires N times. `TaskScheduler` already coalesces tasks by key, but the first invocation still starts an async task immediately (setting `_running = true`), while tasks 2-N each write to `_holdingTasks`. The first task runs against stale data (only bar 1 present); the merged final task runs against the full dataset. At minimum this is 2 full passes of every indicator. With `queueMicrotask` debouncing, all synchronous `appendData` calls accumulate into a single pending set; exactly one task batch fires after the sync block ends.  
**How:**
- Add `private readonly _pendingCalcMap = new Map<string, IndicatorImp>()` and `private _calcMicrotaskScheduled = false` to `ChartStore`.
- In `_calcIndicator(data)`: instead of directly calling `this._taskScheduler.add(tasks)`, accumulate indicators into `_pendingCalcMap` by ID (last write wins per ID) and schedule a `queueMicrotask` if not already scheduled.
- The microtask drains `_pendingCalcMap`, builds the `tasks` record from the accumulated indicators, clears the map, then calls `this._taskScheduler.add(tasks)`.
- This reduces N synchronous `appendData` calls to a single indicator-calc round, eliminating redundant intermediate computations.

---

### [IMPL] 14. `requestIdleCallback` deferral for large-dataset indicator calculation
**Impact:** ★★★★★  
**Files:** `src/engine/Store.ts`  
**Why:** When loading a large historical dataset (≥ 2 000 bars), all indicator calculations run immediately, blocking the main thread before the first frame is painted. On a 10 000-bar load with EMA + MACD + RSI, this is 15-30 ms of synchronous JS on the critical paint path. Using `requestIdleCallback` (with `setTimeout(fn, 0)` fallback for Safari) allows the chart to render its first frame immediately; indicators paint in during the next browser idle period. This matches TradingView's behavior (chart appears instantly, indicators load in 1-2 frames later).  
**How:**
- Inside the microtask added by item 13's debounce, check `this._dataList.length >= IDLE_CALC_THRESHOLD` (default 2 000).
- If above threshold: wrap `this._taskScheduler.add(tasks)` in a `requestIdleCallback` (deadline-aware) / `setTimeout(fn, 0)` fallback.
- If below threshold: call `this._taskScheduler.add(tasks)` directly (no deferral for small updates — live tick latency must stay sub-frame).
- When the deferred callback fires, the chart already has data rendered and indicators paint on the next layout cycle.

---

### [SPEC] 15. VBO overscan — tile-based pre-render buffer
**Impact:** ★★★★☆  
**Files:** `src/engine/common/CandleWebGLRenderer.ts`, `src/engine/view/CandleBarView.ts`  
**Why:** The existing pure-pan fast path (O(1) uniform update) only applies when the *identical* set of visible bars is in the VBO. As soon as the user pans by even one bar, the fingerprint changes → full O(N) VBO rebuild. With a VBO overscan buffer (OVERSCAN = 64 bars pre-rendered beyond the viewport on both sides), pans of up to 64 bars in either direction resolve without rebuilding the VBO — only a pan-offset uniform update is needed. This is the chart-specific form of tile-based pre-rendering: the VBO acts as a wider pre-rendered tile, and the scissor/viewport exposes only the visible sub-region.  
**How:**
- Add `dataIndex: number` to `BarRenderData`.
- Add private fields `_vboFirstDataIdx`, `_vboLastDataIdx`, `_vboVisFirstDataIdx`, `_drawStartOffset` to `CandleWebGLRenderer`.
- Extend `setData(bars, visibleOffset?, visibleCount?)` to accept overscan metadata.
- In `setData()`, add an **overscan fast path** before the existing pure-pan check: if `newFirstVisibleDataIdx >= _vboFirstDataIdx && newLastVisibleDataIdx <= _vboLastDataIdx && barStep unchanged && no price data change`, compute pan delta from anchor bar (`_vboVisFirstDataIdx`) and update `_panOffsetCss + _drawStartOffset` without VBO upload.
- In `draw()`, bind the VBO with a byte offset of `_drawStartOffset * BYTES_PER_BAR` when re-specifying instanced attribute pointers, then call `gl.drawArraysInstanced(..., _visibleBarCount)`.
- In `CandleBarView.ts`: build overscan bars (OVERSCAN = 64) before and after the visible range using `chartStore.getDataList()` + `chartStore.dataIndexToCoordinate(i)`; pass `visibleOffset = overscanLeft.length` to `setData()`.

---

---

## Batch 5 — Analytical Audit + Remaining Gap Checklist

### Gap Analysis vs. TradingView (as of Batch 4)

**Rendering path status:**

| Layer | Current state | Gap |
|---|---|---|
| Candles | WebGPU → Worker WebGL2 → main-thread WebGL2 | ✅ |
| Indicators | SharedIndicatorGLCanvas — instanced WebGL2 | ✅ |
| Axis labels | TextWebGLRenderer (instanced GPU text) | ✅ |
| Crosshair labels | TextWebGLRenderer | ✅ |
| Price / last-value labels | TextWebGLRenderer | ✅ |
| Grid lines | Canvas2D — one `createFigure('line')` per tick | ❌ Item 21 |
| Tooltip text layout | Canvas2D — `ctx.measureText` ×18 per `mousemove` | ❌ Item 18 |
| Area chart gradient | `createLinearGradient` recreated every frame | ❌ Item 20 |
| Grid compositing mode | `destination-over` — expensive per-pixel blend | ❌ Item 17 |

**Layout loop status:**

| Mechanism | Current state | Gap |
|---|---|---|
| Layout dedup fence | `Promise.resolve().then()` — fires at microtask time | Runs before vsync → Item 16 |
| Indicator calc dedup | `queueMicrotask` → `requestIdleCallback` | ✅ Batch 4 |
| Live-tick indicator recalc | Full O(N) `.map()` on every tick update | 30 000 ops/s at 10k bars → Item 22 |

**Hot-path allocation audit:**

| Allocation | Location | Rate | Fix |
|---|---|---|---|
| `createLinearGradient()` | `CandleAreaView.drawImp` | 60×/s at rest | Item 20 |
| `createFont()` string | tooltip + axis views | 30–50×/frame | Item 19 |
| `ctx.measureText()` | `IndicatorTooltipView`, `CandleTooltipView` | 18+×/mousemove | Item 18 |

**VBO bandwidth audit:**
- Pan by 1 bar → fingerprint mismatch → full O(N) VBO rebuild: 500 bars × 32 B = 16 KB upload per step.
- At 60fps scroll: 960 KB/s of redundant VBO uploads eliminated by Item 15.

---

### [IMPL] 16. `requestAnimationFrame` gate for `Chart.layout()`
**Impact:** ★★★★☆  
**Files:** `src/engine/Chart.ts`  
**Why:** `Chart.layout()` uses `Promise.resolve().then(() => { this._layout(); this._layoutPending = false })` as its dedup fence. Promise microtasks fire synchronously after the current call stack, before the browser compositor runs. On a 125 Hz mouse, `layout()` fires up to twice per vsync window and may execute mid-frame. Using `requestAnimationFrame` aligns `_layout()` exactly with vsync, cutting redundant layout invocations in half during fast scroll and eliminating mid-frame canvas clears.  
**How:** Replace `Promise.resolve().then(() => { this._layout(); this._layoutPending = false })` with `requestAnimationFrame(() => { this._layout(); this._layoutPending = false })`. Store the rAF handle in `private _layoutRafId = 0` to allow cancellation in `destroy()`.

---

### [IMPL] 17. Remove `destination-over` compositing from `GridView`
**Impact:** ★★★☆☆  
**Files:** `src/engine/view/GridView.ts`  
**Why:** `ctx.globalCompositeOperation = 'destination-over'` forces the GPU to perform a per-pixel alpha blend on the entire grid canvas to place grid content "behind" existing pixels. Because candle and indicator layers are GPU-accelerated canvases in DOM z-order above the 2D canvas, the compositor already renders the grid below the candles without any Canvas2D blending — making the `destination-over` operation entirely redundant.  
**How:** Remove `ctx.globalCompositeOperation = 'destination-over'` and its surrounding `ctx.save()/restore()`. Verify visually that grid renders behind candles under DOM z-order alone (confirmed: main 2D canvas z-index is lower than all GL canvases).

---

### [IMPL] 18. `measureText` result cache in tooltip views
**Impact:** ★★★★☆  
**Files:** `src/engine/view/IndicatorTooltipView.ts`, `src/engine/view/CandleTooltipView.ts`  
**Why:** `drawStandardTooltipLegends()` calls `ctx.font = createFont(...)` + `ctx.measureText(title.text)` + `ctx.measureText(value.text)` for every legend in every indicator on every `mousemove`-triggered redraw. With 3 indicators × 3 values = 18 `measureText` calls at 60fps pointer rate = 1 080 font-shaping ops/second. Blink's `measureText` involves Unicode segmentation + glyph lookup even for short ASCII strings. Measured widths are stable for the same text+font combination — price values only change on a new tick, not per pointer event.  
**How:** Add a module-level `const _textWidthCache = new Map<string, number>()` in each tooltip-view file. Replace `ctx.measureText(text).width` with a helper `cachedTextWidth(ctx, text, font): number` that checks the cache keyed by `"${font}\0${text}"`, measures + stores on miss, and returns the cached value. Reset via `.clear()` only on explicit style-change events, not per frame.

---

### [IMPL] 19. Memoize `createFont()` string construction
**Impact:** ★★☆☆☆  
**Files:** `src/engine/common/utils/canvas.ts`  
**Why:** `createFont(size, weight, family)` constructs a CSS font string via template literal on every call. It is invoked 30–50× per frame across tooltip, axis, and label views. The number of distinct font variants in a chart is tiny (3–5 combinations). A Map-based cache eliminates the repeated string allocations.  
**How:** Add `const _fontCache = new Map<string, string>()` at module scope. Key: `"${size}:${weight}:${family}"`. Return cache hit immediately; store and return on miss.

---

### [IMPL] 20. Cache `CanvasGradient` in `CandleAreaView`
**Impact:** ★★★☆☆  
**Files:** `src/engine/view/CandleAreaView.ts`  
**Why:** `ctx.createLinearGradient(0, bounding.height, 0, minY)` runs on every `drawImp` call — including the live-tick ripple animation at 60fps — even when zoom and price range are unchanged. `createLinearGradient` allocates a GPU-composited gradient object on each call.  
**How:** Add `private _gradientCache: { gradient: CanvasGradient; height: number; minY: number } | null = null`. Before calling `createLinearGradient`, check if `_gradientCache?.height === bounding.height && _gradientCache?.minY === minY`; reuse on match. Invalidate and recreate on mismatch.

---

### [SPEC] 21. GPU grid lines via `IndicatorLineWebGLRenderer`
**Impact:** ★★★★☆  
**Files:** `src/engine/view/GridView.ts`  
**Why:** `GridView.drawImp()` issues one `createFigure({ name: 'line' })?.draw(ctx)` call per tick. A 3-pane chart with 10 H + 10 V ticks per pane = 60 Canvas2D path open/stroke/close cycles per grid redraw. `IndicatorLineWebGLRenderer` already packs every line segment as a 16-byte VBO entry and renders all segments in one `gl.drawArraysInstanced()` call. Grid lines have the same geometry as indicator lines and map directly to the `[x1, y1, x2, y2]` + colour instanced attribute layout.  
**How:**
- Collect all H + V tick segments into a flat array of `GridLineSegment = { x1, y1, x2, y2, r, g, b, a }`.
- Add `setGridLines(segments)` to `IndicatorLineWebGLRenderer` (or reuse `setData` with a separate VBO region).
- Call `beginFrame()` + draw grid segments first in `IndicatorWidget` (grid renders behind indicator lines).
- Ticks change only on zoom/resize (not on pan) — gate the upload on a tick-version counter to skip redundant VBO writes.
- Canvas2D fallback (no shared GL canvas): keep the existing `createFigure` loop under `if (glCanvas === null)`.

---

### [SPEC] 22. Incremental tail-update for live-tick indicator recalc
**Impact:** ★★★★★  
**Files:** `src/engine/Store.ts`, `src/engine/component/Indicator.ts`  
**Why:** `updateData(latestBar)` triggers a full `dataList.map()` pass for every indicator. With 10k bars and 3 standard indicators (MACD, RSI, SMA) this is ~30 000 scalar operations per main-thread tick. Only the last `maxPeriod + 1` bars can produce changed output; all earlier results are already correct. Restricting the recalc window to `maxPeriod * 2` bars and splicing the tail back into `indicator.result` achieves O(maxPeriod) per tick — a ~200× speedup at N = 10 000.  
**How:**
- Add `updateMode?: 'full' | 'tail'` to the internal `_calcIndicator` call signature.
- In `updateData()` (single-bar replace), pass `updateMode: 'tail'`.
- In `Indicator.calcImp()` for tail mode: `windowStart = Math.max(0, dataList.length - maxPeriod * 2)`; call `indicator.calc(dataList.slice(windowStart))`; splice the returned array back into `indicator.result` from `windowStart`.
- Guard: only activate tail mode when `resultList.length === dataList.length - 1` (complete prior result exists). Fall back to full mode otherwise (initial load, param change, etc.).
- `maxPeriod` is `Math.max(...indicator.calcParams)` — already available on every `IndicatorImp`.

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
