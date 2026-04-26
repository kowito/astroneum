# Plugin & Indicator Development Guide

This guide shows how to extend Astroneum with custom indicators, WebGL renderers, chart plugins, and script-based indicators.

---

## Table of Contents

1. [Concepts overview](#concepts-overview)
2. [IndicatorPlugin — typed TypeScript indicator](#indicatorplugin--typed-typescript-indicator)
   - [Simple scalar output](#simple-scalar-output)
   - [Multi-series output](#multi-series-output)
   - [Canvas 2D renderer (render2D)](#canvas-2d-renderer-render2d)
   - [WebGL2 renderer (renderGL)](#webgl2-renderer-rendergl)
3. [ChartPlugin — per-chart lifecycle](#chartplugin--per-chart-lifecycle)
4. [Raw engine indicator (IndicatorTemplate)](#raw-engine-indicator-indicatortemplate)
5. [ScriptEngine — runtime scripting](#scriptengine--runtime-scripting)
6. [Built-in indicator reference](#built-in-indicator-reference)
7. [Full API reference](#full-api-reference)

---

## Concepts overview

| Layer | When to use |
|---|---|
| `IndicatorPlugin` | Custom indicator written in TypeScript with optional Canvas 2D or WebGL2 renderer. **Recommended entry point.** |
| `ChartPlugin` | Bundle one or more `IndicatorPlugin`s with chart lifecycle hooks (e.g. auto-create on mount, teardown on unmount). |
| `IndicatorTemplate` (engine) | Direct access to the engine's low-level indicator format. Use when you need full control over figures, drawing, and pane behaviour. |
| `ScriptEngine` | Let end-users write Pine-Script-inspired JS snippets at runtime without a build step. |

---

## IndicatorPlugin — typed TypeScript indicator

### Interface

```typescript
interface IndicatorPlugin<TOutput> {
  name: string               // unique registry key — used in createIndicator()
  shortName?: string         // display name in chart legend (defaults to name)
  calcParams?: number[]      // default params, overridable by user
  calc(data: CandleData[], params: number[]): TOutput[]
  render2D?(ctx: CanvasRenderingContext2D, output: TOutput[], viewport: Viewport): void
  renderGL?(gl: WebGL2RenderingContext, output: TOutput[], viewport: Viewport, vbo: WebGLBuffer): void
}
```

`calc` is the only required method. `render2D` and `renderGL` are optional custom draw passes.  
When **neither** renderer is provided, Astroneum auto-plots the output values as line(s).  
When `renderGL` is present it runs on a dedicated WebGL2 layer with a stable per-indicator `vbo`.  
If WebGL2 is unavailable in the browser, `render2D` is used as fallback when available.

---

### Simple scalar output

Each `calc` return element maps to one candle bar. Return a plain `number` (or `null`) per bar.

```typescript
import { registerIndicatorPlugin, type IndicatorPlugin, type CandleData } from 'astroneum'

const spreadIndicator: IndicatorPlugin<number> = {
  name: 'SPREAD',
  shortName: 'Spread',
  calc(data: CandleData[]): number[] {
    return data.map(bar => bar.high - bar.low)
  }
}

registerIndicatorPlugin(spreadIndicator)
```

Then add it to any chart:

```tsx
<AstroneumChart
  subIndicators={['SPREAD']}
  // or via ref:
  // ref.current.createIndicator('SPREAD')
  ...
/>
```

---

### Multi-series output

Return an object per bar to plot multiple named lines simultaneously.

```typescript
interface BandOutput {
  upper: number | null
  middle: number | null
  lower: number | null
}

const donchianChannel: IndicatorPlugin<BandOutput> = {
  name: 'DONCHIAN',
  shortName: 'Donchian',
  calcParams: [20],
  calc(data: CandleData[], [len]: number[]): BandOutput[] {
    return data.map((_, index) => {
      const slice = data.slice(Math.max(0, index - len + 1), index + 1)
      const highs = slice.map(b => b.high)
      const lows  = slice.map(b => b.low)
      return {
        upper:  Math.max(...highs),
        middle: (Math.max(...highs) + Math.min(...lows)) / 2,
        lower:  Math.min(...lows)
      }
    })
  }
}

registerIndicatorPlugin(donchianChannel)
```

Each key in the returned object becomes a separate series in the chart legend.  
Return `null` for bars where a value is not yet computable (e.g. warm-up period).

---

### Canvas 2D renderer (render2D)

Use `render2D` for lightweight overlays (< 10 k points) or any drawing that doesn't need GPU acceleration.

The `Viewport` argument describes the currently visible region:

```typescript
interface Viewport {
  priceMin: number  // visible price range bottom
  priceMax: number  // visible price range top
  timeMin: number   // earliest visible candle timestamp (ms)
  timeMax: number   // latest visible candle timestamp (ms)
  resolution: readonly [width: number, height: number]  // canvas size in device pixels
}
```

```typescript
import {
  registerIndicatorPlugin,
  type IndicatorPlugin,
  type CandleData,
  type Viewport
} from 'astroneum'

interface PivotOutput {
  pivot: number | null
}

const pivotLines: IndicatorPlugin<PivotOutput> = {
  name: 'PIVOT_LINES',
  shortName: 'Pivot',
  calc(data: CandleData[]): PivotOutput[] {
    return data.map((bar, i) => {
      if (i === 0) return { pivot: null }
      const prev = data[i - 1]
      return { pivot: (prev.high + prev.low + prev.close) / 3 }
    })
  },
  render2D(ctx: CanvasRenderingContext2D, output: PivotOutput[], vp: Viewport): void {
    const [width, height] = vp.resolution
    const priceRange = vp.priceMax - vp.priceMin

    ctx.save()
    ctx.strokeStyle = '#f5a623'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])

    output.forEach(row => {
      if (row.pivot === null) return
      const y = height - ((row.pivot - vp.priceMin) / priceRange) * height
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    })

    ctx.restore()
  }
}

registerIndicatorPlugin(pivotLines)
```

> **Important:** always call `ctx.save()` / `ctx.restore()` around your draw code.  
> Do not clear the canvas — Astroneum composites multiple layers.

---

### WebGL2 renderer (renderGL)

Use `renderGL` for high-density data, smooth anti-aliased lines, or GPU-intensive effects.

Astroneum provides a stable `vbo` (vertex buffer object) that persists across frames — upload new data only when your output changes, not every frame.

```typescript
import {
  registerIndicatorPlugin,
  type IndicatorPlugin,
  type CandleData,
  type Viewport
} from 'astroneum'

const VERT_SHADER = `#version 300 es
  in vec2 a_pos;
  uniform vec2 u_resolution;
  void main() {
    vec2 clip = (a_pos / u_resolution) * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0, 1);
  }`

const FRAG_SHADER = `#version 300 es
  precision mediump float;
  uniform vec4 u_color;
  out vec4 fragColor;
  void main() { fragColor = u_color; }`

function compileProgram (gl: WebGL2RenderingContext): WebGLProgram {
  function shader (type: number, src: string) {
    const sh = gl.createShader(type)!
    gl.shaderSource(sh, src)
    gl.compileShader(sh)
    return sh
  }
  const prog = gl.createProgram()!
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT_SHADER))
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG_SHADER))
  gl.linkProgram(prog)
  return prog
}

let _program: WebGLProgram | null = null

interface SMAOutput { value: number | null }

const smaGL: IndicatorPlugin<SMAOutput> = {
  name: 'SMA_GL',
  shortName: 'SMA (GL)',
  calcParams: [20],
  calc(data: CandleData[], [len]: number[]): SMAOutput[] {
    return data.map((_, i) => {
      if (i < len - 1) return { value: null }
      const slice = data.slice(i - len + 1, i + 1)
      return { value: slice.reduce((s, b) => s + b.close, 0) / len }
    })
  },
  renderGL(
    gl: WebGL2RenderingContext,
    output: SMAOutput[],
    vp: Viewport,
    vbo: WebGLBuffer
  ): void {
    if (!_program) _program = compileProgram(gl)

    const [width, height] = vp.resolution
    const priceRange = vp.priceMax - vp.priceMin
    const timeRange  = vp.timeMax - vp.timeMin

    // Build vertex array — one x,y pair per visible bar
    const vertices: number[] = []
    output.forEach((row, i) => {
      if (row.value === null) return
      // map to pixel space; use index ratio as a simple x approximation
      const x = (i / (output.length - 1)) * width
      const y = height - ((row.value - vp.priceMin) / priceRange) * height
      vertices.push(x, y)
      void timeRange // suppress unused warning; use real time mapping in production
    })
    if (vertices.length < 4) return

    // Upload vertices to the reusable VBO
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW)

    gl.useProgram(_program)

    const resLoc   = gl.getUniformLocation(_program, 'u_resolution')
    const colorLoc = gl.getUniformLocation(_program, 'u_color')
    const posLoc   = gl.getAttribLocation(_program, 'a_pos')

    gl.uniform2f(resLoc, width, height)
    gl.uniform4f(colorLoc, 0.16, 0.38, 1.0, 1.0)  // #2962ff

    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    gl.drawArrays(gl.LINE_STRIP, 0, vertices.length / 2)
  }
}

registerIndicatorPlugin(smaGL)
```

> **Tips:**
> - Compile shaders once and cache them outside the render function.
> - The `vbo` is created per indicator and destroyed when the indicator is removed — never delete it manually.
> - `gl.clear()` is called by Astroneum before your pass; do not call it yourself.

---

## ChartPlugin — per-chart lifecycle

Use `ChartPlugin` when you want to:
- Bundle one or more indicators that auto-create when a chart mounts
- Run setup logic (subscribe to external data, register hotkeys, etc.)
- Guarantee cleanup when the chart unmounts

```typescript
import {
  type ChartPlugin,
  type ChartPluginContext,
  type IndicatorPlugin
} from 'astroneum'

const vwapIndicator: IndicatorPlugin<number | null> = {
  name: 'VWAP',
  shortName: 'VWAP',
  calc(data) {
    let cumPV = 0, cumVol = 0
    return data.map(bar => {
      const vol = bar.volume ?? 0
      cumPV  += ((bar.high + bar.low + bar.close) / 3) * vol
      cumVol += vol
      return cumVol === 0 ? null : cumPV / cumVol
    })
  }
}

const vwapPlugin: ChartPlugin = {
  name: 'vwap-plugin',
  // 1. Register indicator templates before chart creates any indicators
  indicators: [vwapIndicator],
  // 2. Called once after the chart is mounted
  onInit({ chart }: ChartPluginContext) {
    chart.createIndicator('VWAP', true)   // true = overlay on main pane

    // Return a disposer — called when the chart unmounts
    return () => {
      chart.removeIndicator({ name: 'VWAP' })
    }
  }
}
```

Pass the plugin as a prop:

```tsx
<AstroneumChart
  plugins={[vwapPlugin]}
  symbol={...}
  period={...}
  datafeed={...}
/>
```

Multiple plugins are supported and executed in order. Disposers run in **reverse** order (LIFO).

### `ChartPluginContext`

| Property | Type | Description |
|---|---|---|
| `chart` | `Chart` | The engine chart instance |
| `registerIndicatorPlugin` | `(plugin) => void` | Register a single plugin at runtime |
| `registerIndicatorPlugins` | `(plugins) => void` | Register multiple plugins at runtime |

---

## Raw engine indicator (IndicatorTemplate)

For full control — custom figure types, tooltip labels, drawing primitives — use `registerIndicator` directly.

```typescript
import { registerIndicator, type CandleData } from 'astroneum'
import type { IndicatorTemplate } from 'astroneum'  // re-exported from engine

const myTemplate: IndicatorTemplate = {
  name: 'MY_INDICATOR',
  shortName: 'My Ind',
  series: 'normal',       // 'normal' = sub-pane, 'price' = overlay on candles
  precision: 2,
  calcParams: [14],
  figures: [
    { key: 'value', title: 'Value: ', type: 'line' }
  ],
  calc(dataList: CandleData[], indicator) {
    const [len] = indicator.calcParams
    return dataList.map((_, i) => {
      if (i < len - 1) return { value: null }
      const slice = dataList.slice(i - len + 1, i + 1)
      return { value: slice.reduce((s, b) => s + b.close, 0) / len }
    })
  }
}

registerIndicator(myTemplate)
```

`getSupportedIndicators()` returns the list of all registered names (built-in + custom).

---

## ScriptEngine — runtime scripting

`ScriptEngine` lets end-users write Pine-Script-inspired indicator logic in plain JavaScript without a build step. Scripts run in a strict sandbox with no access to `window`, `document`, `fetch`, or `eval`.

### Usage

```typescript
import { ScriptEngine, AstroneumChart } from 'astroneum'

const engine = ScriptEngine.getInstance()

const template = engine.compile(`
  study('My Oscillator', { overlay: false })

  const len  = input('Length', 14)
  const highs = ta.highest(high, len)
  const lows  = ta.lowest(low, len)
  const range = highs.map((h, i) => h - lows[i])

  plot(range, { title: 'Range', color: '#2962ff' })
`)

// template.name is set from study()
// Immediately usable in any chart
chartRef.current.createIndicator(template.name)
```

### Script API

#### `study(name, options?)`

Declares the indicator metadata.

| Parameter | Type | Description |
|---|---|---|
| `name` | `string` | Indicator name used as registry key |
| `options.shortName` | `string` | Display label (defaults to `name`) |
| `options.overlay` | `boolean` | `true` to render on the main price pane |
| `options.precision` | `number` | Decimal places in tooltip (default `4`) |

#### `input(title, defaultValue, options?)`

Declares a user-editable parameter. Returns `defaultValue` at compile time.

```javascript
const length = input('Length', 14)
const source = input('Source', 'close', { options: ['open', 'high', 'low', 'close'] })
```

#### `plot(values, options?)`

Registers a series to render as a line.

| Parameter | Type | Description |
|---|---|---|
| `values` | `number[]` | One value per bar; use `null`/`NaN` to skip a bar |
| `options.title` | `string` | Legend label |
| `options.color` | `string` | CSS hex color |
| `options.lineWidth` | `number` | Line thickness in pixels |

Call `plot()` multiple times to add multiple lines.

#### Built-in data arrays

Inside a script the following arrays are automatically available, each with one element per bar in chronological order:

| Variable | Description |
|---|---|
| `open` | Open prices |
| `high` | High prices |
| `low` | Low prices |
| `close` | Close prices |
| `volume` | Volume values |

#### `ta` — technical analysis helpers

| Function | Signature | Description |
|---|---|---|
| `ta.sma` | `(src, len)` | Simple moving average |
| `ta.ema` | `(src, len)` | Exponential moving average |
| `ta.rma` | `(src, len)` | Wilder's moving average (used in RSI) |
| `ta.wma` | `(src, len)` | Weighted moving average |
| `ta.rsi` | `(src, len)` | Relative Strength Index |
| `ta.bbands` | `(src, len, mult?)` | Bollinger Bands → `{ upper, middle, lower }` |
| `ta.macd` | `(src, fast?, slow?, signal?)` | MACD → `{ macd, signal, histogram }` |
| `ta.highest` | `(src, len)` | Rolling maximum |
| `ta.lowest` | `(src, len)` | Rolling minimum |
| `ta.stdev` | `(src, len)` | Rolling standard deviation |
| `ta.cross` | `(a, b)` | Cross in either direction → `boolean[]` |
| `ta.crossover` | `(a, b)` | Cross upward → `boolean[]` |
| `ta.crossunder` | `(a, b)` | Cross downward → `boolean[]` |

`math` is also available as an alias for `Math`.

### Complete script example — MACD

```javascript
study('MACD', { overlay: false })

const fast   = input('Fast', 12)
const slow   = input('Slow', 26)
const signal = input('Signal', 9)

const { macd, signal: signalLine, histogram } = ta.macd(close, fast, slow, signal)

plot(macd,      { title: 'MACD',      color: '#2962ff' })
plot(signalLine, { title: 'Signal',   color: '#ff6b35' })
plot(histogram,  { title: 'Hist',     color: '#26a69a' })
```

### ScriptEngine instance methods

| Method | Description |
|---|---|
| `compile(source, name?)` | Compile source string, register indicator, return `CompiledIndicator`. Throws on syntax/runtime error. |
| `get(name)` | Return a previously compiled template by name |
| `list()` | Return all compiled indicator names |
| `remove(name)` | Remove a compiled indicator from the registry |

---

## Built-in indicator reference

All built-in indicators are available by name via `createIndicator()` or the `subIndicators` / `mainIndicators` props.

| Name | Description |
|---|---|
| `MA` | Moving Average |
| `EMA` | Exponential Moving Average |
| `SMA` | Simple Moving Average |
| `BOLL` | Bollinger Bands |
| `MACD` | MACD |
| `RSI` | Relative Strength Index |
| `KDJ` | Stochastic KDJ |
| `VOL` | Volume |
| `OBV` | On Balance Volume |
| `AVP` | Average Price |
| `AO` | Awesome Oscillator |
| `BIAS` | BIAS |
| `BRAR` | BRAR |
| `BBI` | Bull & Bear Index |
| `CCI` | Commodity Channel Index |
| `CR` | Current Ratio |
| `DMA` | Different of Moving Average |
| `DMI` | Directional Movement Index |
| `EMV` | Ease of Movement |
| `MTM` | Momentum |
| `PVT` | Price & Volume Trend |
| `PSY` | Psychological Line |
| `ROC` | Rate of Change |
| `SAR` | Stop and Reverse |
| `TRIX` | Triple Exponentially Smoothed Average |
| `VR` | Volume Ratio |
| `WR` | Williams %R |

Use `getSupportedIndicators()` at runtime to retrieve the complete list including any custom-registered indicators.

---

## Full API reference

See [api.md](api.md) for the complete type reference including `IndicatorPlugin`, `ChartPlugin`, `ChartPluginContext`, `Viewport`, `registerIndicatorPlugin`, `registerIndicatorPlugins`, `createIndicatorTemplateFromPlugin`, `registerIndicator`, `getSupportedIndicators`, and `ScriptEngine`.
