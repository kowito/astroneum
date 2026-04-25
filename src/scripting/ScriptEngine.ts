/**
 * Client-side JavaScript indicator scripting engine.
 *
 * Lets users write Pine-Script–inspired indicator logic in plain JS
 * and compile it into an IndicatorTemplate that can be registered
 * with the chart engine via `registerIndicator()`.
 *
 * Security: scripts run inside an isolated Function scope with a
 * curated API surface.  No access to window/document/fetch/eval.
 *
 * Usage:
 *   const engine = ScriptEngine.getInstance()
 *   const template = engine.compile(`
 *     study('My MA', { overlay: true })
 *     const len = input('Length', 14)
 *     plot(ta.sma(close, len), { title: 'SMA', color: '#2962ff' })
 *   `)
 *   chart.registerIndicator(template)
 */

import type { CandleData } from '@/engine'
import type { IndicatorTemplate, IndicatorFigure } from '@/engine/component/Indicator'

// ---------------------------------------------------------------------------
// Public script API types
// ---------------------------------------------------------------------------

export interface StudyOptions {
  /** Display name shown in tooltip */
  shortName?: string
  /** Whether to overlay on the price pane (default false) */
  overlay?: boolean
  /** Precision of displayed values */
  precision?: number
}

export interface PlotOptions {
  title?: string
  color?: string
  lineWidth?: number
  visible?: boolean
}

export interface InputOptions {
  type?: 'int' | 'float' | 'bool' | 'string'
  options?: (number | string)[]
}

export interface ScriptResult {
  /** Each element corresponds to a bar in the input dataList */
  values: Array<Record<string, number | null>>
  /** Figure metadata derived from plot() calls */
  figures: Array<IndicatorFigure>
  /** Study metadata */
  meta: {
    name: string
    shortName: string
    overlay: boolean
    precision: number
  }
}

// ---------------------------------------------------------------------------
// Technical analysis helpers exposed to scripts
// ---------------------------------------------------------------------------

function sma (src: number[], len: number): number[] {
  let sum = 0
  return src.map((v, i) => {
    sum += isFinite(v) ? v : 0
    if (i >= len) sum -= isFinite(src[i - len]) ? src[i - len] : 0
    if (i < len - 1) return NaN
    return sum / len
  })
}

function ema (src: number[], len: number): number[] {
  const k = 2 / (len + 1)
  const result: number[] = []
  let prev = NaN
  src.forEach((v, i) => {
    if (!isFinite(v)) { result.push(NaN); return }
    if (!isFinite(prev)) { prev = v; result.push(v); return }
    prev = v * k + prev * (1 - k)
    result.push(prev)
    void i
  })
  return result
}

function rma (src: number[], len: number): number[] {
  const k = 1 / len
  const result: number[] = []
  let prev = NaN
  src.forEach(v => {
    if (!isFinite(v)) { result.push(NaN); return }
    prev = isFinite(prev) ? (v * k + prev * (1 - k)) : v
    result.push(prev)
  })
  return result
}

function wma (src: number[], len: number): number[] {
  return src.map((_, i) => {
    if (i < len - 1) return NaN
    let sumW = 0, sumV = 0
    for (let j = 0; j < len; j++) {
      const w = len - j
      sumW += w
      sumV += (src[i - j] ?? NaN) * w
    }
    return sumV / sumW
  })
}

function rsi (src: number[], len: number): number[] {
  let sumGain = 0, sumLoss = 0
  return src.map((v, i) => {
    if (i === 0) return NaN
    const diff = v - src[i - 1]
    sumGain += diff > 0 ? diff : 0
    sumLoss += diff < 0 ? -diff : 0
    if (i < len) return NaN
    if (i > len) {
      const prevDiff = src[i - 1] - src[i - 2]
      sumGain -= prevDiff > 0 ? prevDiff : 0
      sumLoss -= prevDiff < 0 ? -prevDiff : 0
    }
    const avgGain = sumGain / len
    const avgLoss = sumLoss / len
    return avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  })
}

function highest (src: number[], len: number): number[] {
  return src.map((_, i) => {
    const slice = src.slice(Math.max(0, i - len + 1), i + 1)
    return Math.max(...slice.filter(isFinite))
  })
}

function lowest (src: number[], len: number): number[] {
  return src.map((_, i) => {
    const slice = src.slice(Math.max(0, i - len + 1), i + 1)
    return Math.min(...slice.filter(isFinite))
  })
}

function stdev (src: number[], len: number): number[] {
  const means = sma(src, len)
  return src.map((_, i) => {
    if (i < len - 1) return NaN
    let sq = 0
    for (let j = 0; j < len; j++) sq += (src[i - j] - means[i]) ** 2
    return Math.sqrt(sq / len)
  })
}

function cross (a: number[], b: number[]): boolean[] {
  return a.map((v, i) => i > 0 && ((a[i - 1] <= b[i - 1] && v > b[i]) || (a[i - 1] >= b[i - 1] && v < b[i])))
}

function crossover (a: number[], b: number[]): boolean[] {
  return a.map((v, i) => i > 0 && a[i - 1] < b[i - 1] && v > b[i])
}

function crossunder (a: number[], b: number[]): boolean[] {
  return a.map((v, i) => i > 0 && a[i - 1] > b[i - 1] && v < b[i])
}

const TA = {
  sma, ema, rma, wma, rsi,
  highest, lowest, stdev,
  cross, crossover, crossunder,
  /** Bollinger Bands — returns { upper, middle, lower } */
  bbands (src: number[], len: number, mult = 2): { upper: number[], middle: number[], lower: number[] } {
    const mid = sma(src, len)
    const dev = stdev(src, len)
    return {
      upper: mid.map((m, i) => m + mult * dev[i]),
      middle: mid,
      lower: mid.map((m, i) => m - mult * dev[i])
    }
  },
  /** MACD — returns { macd, signal, histogram } */
  macd (src: number[], fast = 12, slow = 26, signal = 9): { macd: number[], signal: number[], histogram: number[] } {
    const fastEma = ema(src, fast)
    const slowEma = ema(src, slow)
    const macdLine = fastEma.map((v, i) => v - slowEma[i])
    const signalLine = ema(macdLine.map(v => isFinite(v) ? v : 0), signal)
    return {
      macd: macdLine,
      signal: signalLine,
      histogram: macdLine.map((v, i) => v - signalLine[i])
    }
  }
}

// ---------------------------------------------------------------------------
// Script execution sandbox
// ---------------------------------------------------------------------------

const FORBIDDEN = ['window', 'document', 'location', 'fetch', 'XMLHttpRequest', 'WebSocket', 'eval', 'Function', 'setTimeout', 'setInterval', 'importScripts', 'require', 'process', '__dirname', '__filename', 'global', 'globalThis']

function buildSandboxWrapper (scriptBody: string): string {
  const forbidden = FORBIDDEN.map(k => `const ${k} = undefined;`).join(' ')
  return `
    "use strict";
    ${forbidden}

    let _name = 'Script';
    let _shortName = 'Script';
    let _overlay = false;
    let _precision = 4;
    const _figures = [];
    const _inputs = {};
    let _rows = null;

    function study(name, opts) {
      _name = name;
      _shortName = (opts && opts.shortName) ? opts.shortName : name;
      _overlay = (opts && opts.overlay) === true;
      _precision = (opts && opts.precision != null) ? opts.precision : 4;
    }

    function input(title, defaultVal, opts) {
      _inputs[title] = defaultVal;
      return defaultVal;
    }

    function plot(values, opts) {
      const key = 'plot' + (_figures.length + 1);
      _figures.push({
        key,
        title: (opts && opts.title) ? opts.title + ': ' : key + ': ',
        type: 'line',
      });
      if (!_rows) _rows = values.map(v => ({}));
      values.forEach((v, i) => { if (_rows[i]) _rows[i][key] = (v == null || !isFinite(v)) ? null : v; });
    }

    function plotLine(values, opts) { plot(values, opts); }

    const ta = TA;
    const math = Math;

    ${scriptBody}

    return { name: _name, shortName: _shortName, overlay: _overlay, precision: _precision, figures: _figures, rows: _rows || [] };
  `
}

// ---------------------------------------------------------------------------
// ScriptEngine
// ---------------------------------------------------------------------------

export interface CompiledIndicator extends IndicatorTemplate {
  /** Original source for editing */
  _source: string
}

export class ScriptEngine {
  private static _instance: ScriptEngine | null = null
  private _registry = new Map<string, CompiledIndicator>()

  private constructor () {}

  static getInstance (): ScriptEngine {
    if (!ScriptEngine._instance) ScriptEngine._instance = new ScriptEngine()
    return ScriptEngine._instance
  }

  /**
   * Compile a script string into an IndicatorTemplate.
   * Throws a descriptive Error if compilation or type validation fails.
   */
  compile (source: string, name?: string): CompiledIndicator {
    const wrapper = buildSandboxWrapper(source)

     
    type TAType = typeof TA
    let factory: (open: number[], high: number[], low: number[], close: number[], volume: number[], TA: TAType) => { name: string, shortName: string, overlay: boolean, precision: number, figures: IndicatorFigure[], rows: Array<Record<string, number | null>> }

    try {
      // Create isolated function — only TA is injected from our scope
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      factory = new Function('open', 'high', 'low', 'close', 'volume', 'TA', wrapper) as typeof factory
    } catch (err) {
      throw new Error(`Script syntax error: ${(err as Error).message}`)
    }

    // Dry-run with empty arrays to extract metadata
    let meta: ReturnType<typeof factory>
    try {
      meta = factory([], [], [], [], [], TA)
    } catch (err) {
      throw new Error(`Script runtime error during metadata extraction: ${(err as Error).message}`)
    }

    const indicatorName = name ?? meta.name ?? 'Custom'

    const template: CompiledIndicator = {
      name: indicatorName,
      shortName: meta.shortName ?? indicatorName,
      series: meta.overlay ? 'price' : 'normal',
      precision: meta.precision ?? 4,
      figures: meta.figures,
      _source: source,

      calc (dataList: CandleData[]) {
        const open   = dataList.map(d => d.open)
        const high   = dataList.map(d => d.high)
        const low    = dataList.map(d => d.low)
        const close  = dataList.map(d => d.close)
        const volume = dataList.map(d => d.volume ?? 0)

        let result: ReturnType<typeof factory>
        try {
          result = factory(open, high, low, close, volume, TA)
        } catch (err) {
          console.error('[ScriptEngine] runtime error:', err)
          return dataList.map(() => ({}))
        }

        // Sync figures if script added plots
        if (result.figures.length > 0) {
          this.figures = result.figures
        }

        return result.rows
      }
    }

    this._registry.set(indicatorName, template)
    return template
  }

  /** Get a previously compiled template by name */
  get (name: string): CompiledIndicator | undefined {
    return this._registry.get(name)
  }

  /** All registered script names */
  list (): string[] {
    return [...this._registry.keys()]
  }

  /** Remove a compiled indicator */
  remove (name: string): void {
    this._registry.delete(name)
  }
}

export default ScriptEngine
