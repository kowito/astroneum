'use client'

import { useEffect, useRef, useState } from 'react'
import type { AstroneumChart as AstroneumChartType, CandleData, Datafeed, Period, SymbolInfo } from 'astroneum'
import 'astroneum/style.css'

// ---------------------------------------------------------------------------
// Render benchmark page — driven by scripts/render-bench.mjs.
//
//   /bench/?bars=20000&path=webgl&ind=default
//
//   bars  number of synthetic 1-minute bars (default 20000)
//   path  auto | webgl | worker | canvas2d — which candle renderer to allow
//   ind   default | none — a representative indicator set, or candles only
//
// The page exposes window.__bench: { ready, info, run(scenario, frames) }.
// Every requestAnimationFrame callback is timed, so a scenario reports the
// main-thread time the chart spends drawing while the input runs.
// ---------------------------------------------------------------------------

type SubscribeCallback = Parameters<Datafeed['subscribe']>[2]

interface ScenarioResult {
  scenario: string
  inputFrames: number
  measuredFrames: number
  drawFrames: number
  layouts: number
  totalMs: number
  meanMs: number
  p50Ms: number
  p95Ms: number
  maxMs: number
  longFrames: number
}

interface TraceEntry { callback: string, frames: number, totalMs: number }

interface BenchApi {
  ready: boolean
  info: Record<string, unknown>
  run: (scenario: string, inputFrames?: number, settleFrames?: number) => Promise<ScenarioResult>
  /** Which requestAnimationFrame callbacks ran over `frames` frames, idle or while a scenario's input runs. */
  trace: (frames?: number, scenario?: string) => Promise<TraceEntry[]>
  /** Zoom out by `steps` wheel notches so many more bars are visible. */
  zoomOut: (steps?: number) => Promise<void>
}

declare global {
  interface Window { __bench?: BenchApi }
}

const SYMBOL: SymbolInfo = { ticker: 'BENCH', name: 'Synthetic', pricePrecision: 2, volumePrecision: 0 }
const PERIOD: Period = { multiplier: 1, timespan: 'minute', text: '1m' }

/** Deterministic bars so every run sees the same data. */
function makeBars (count: number): CandleData[] {
  let seed = 12345
  const rand = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  const bars: CandleData[] = new Array(count)
  const end = Math.floor(Date.now() / 60000) * 60000
  let price = 100
  for (let i = 0; i < count; i++) {
    const open = price
    const close = open + (rand() - 0.5) * 2
    const high = Math.max(open, close) + rand() * 0.8
    const low = Math.min(open, close) - rand() * 0.8
    bars[i] = {
      timestamp: end - (count - 1 - i) * 60000,
      open,
      high,
      low,
      close,
      volume: Math.round(rand() * 5000) + 100
    }
    price = close
  }
  return bars
}

/** Make the chart fall back to the requested renderer before the library loads. */
function applyPathStubs (path: string): void {
  const w = window as unknown as Record<string, unknown>
  const nav = navigator as unknown as Record<string, unknown>
  if (path === 'webgl' || path === 'worker' || path === 'canvas2d') {
    // Without a usable adapter the WebGPU renderer rejects and the chart keeps WebGL.
    Object.defineProperty(nav, 'gpu', { value: undefined, configurable: true })
  }
  if (path === 'webgl' || path === 'canvas2d') {
    w.OffscreenCanvas = undefined
  }
  if (path === 'canvas2d') {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
      if (kind === 'webgl2' || kind === 'webgl') return null
      return (original as (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) => unknown).call(this, kind, ...rest)
    } as typeof HTMLCanvasElement.prototype.getContext
  }
}

export default function BenchPage () {
  const [Chart, setChart] = useState<typeof AstroneumChartType | null>(null)
  const [config, setConfig] = useState<{ bars: number, path: string, ind: string } | null>(null)
  const datafeedRef = useRef<Datafeed | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const barCount = Math.max(100, Number(params.get('bars') ?? 20000))
    const path = params.get('path') ?? 'auto'
    const ind = params.get('ind') ?? 'default'
    document.title = `Render benchmark · ${barCount} bars · ${path}`

    applyPathStubs(path)

    // ── Frame timing probe ──────────────────────────────────────────────────
    const originalRaf = window.requestAnimationFrame.bind(window)
    const frameMs = new Map<number, number>()   // rAF timestamp → ms spent in callbacks
    let recording = false
    let tracing = false
    const traced = new Map<string, { frames: number, totalMs: number }>()
    window.requestAnimationFrame = (cb: FrameRequestCallback): number => originalRaf((ts) => {
      const t0 = performance.now()
      try {
        cb(ts)
      } finally {
        const spent = performance.now() - t0
        if (recording) frameMs.set(ts, (frameMs.get(ts) ?? 0) + spent)
        if (tracing) {
          const key = `${cb.name || 'anonymous'}: ${cb.toString().replace(/\s+/g, ' ').slice(0, 110)}`
          const entry = traced.get(key) ?? { frames: 0, totalMs: 0 }
          entry.frames++
          entry.totalMs += spent
          traced.set(key, entry)
        }
      }
    })

    // Count GL contexts the page creates (main thread only).
    let glContexts = 0
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
      const ctx = (getContext as (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) => unknown).call(this, kind, ...rest)
      if (ctx !== null && (kind === 'webgl2' || kind === 'webgl')) glContexts++
      return ctx
    } as typeof HTMLCanvasElement.prototype.getContext

    // ── Datafeed ────────────────────────────────────────────────────────────
    const bars = makeBars(barCount)
    let live: SubscribeCallback | null = null
    const datafeed: Datafeed = {
      searchSymbols: async () => [SYMBOL],
      getHistoryData: async (_symbol, _period, from) => {
        // First request covers the whole series; scroll-back requests get nothing.
        if (from < bars[0].timestamp) return []
        return bars
      },
      subscribe: (_symbol, _period, callback) => { live = callback },
      unsubscribe: () => { live = null }
    }
    datafeedRef.current = datafeed

    // ── Scenario driver ─────────────────────────────────────────────────────
    const nextFrame = (): Promise<number> => new Promise(resolve => originalRaf(resolve))
    const mainCanvas = (): HTMLCanvasElement => {
      let best: HTMLCanvasElement | null = null
      let bestArea = 0
      document.querySelectorAll<HTMLCanvasElement>('.astroneum canvas').forEach(c => {
        const area = c.clientWidth * c.clientHeight
        if (area > bestArea) { bestArea = area; best = c }
      })
      if (best === null) throw new Error('chart canvas not found')
      return best
    }
    // The engine attaches its mousemove/wheel listeners on mouseenter, which does
    // not bubble, so fire it on every ancestor of the canvas once.
    let entered = false
    const ensureEntered = (x: number, y: number): void => {
      if (entered) return
      entered = true
      let el: Element | null = mainCanvas()
      while (el !== null && el !== document.body) {
        el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, clientX: x, clientY: y }))
        el = el.parentElement
      }
    }
    const mouse = (type: string, x: number, y: number, buttons = 0): void => {
      ensureEntered(x, y)
      mainCanvas().dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons }))
    }
    const wheel = (x: number, y: number, deltaX: number, deltaY: number): void => {
      ensureEntered(x, y)
      mainCanvas().dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: x, clientY: y, deltaX, deltaY, deltaMode: 0 }))
    }
    const centre = (): { cx: number, cy: number } => {
      const rect = mainCanvas().getBoundingClientRect()
      return { cx: rect.left + rect.width * 0.5, cy: rect.top + rect.height * 0.5 }
    }

    const scenarios: Record<string, (i: number, n: number, cx: number, cy: number) => void> = {
      idle: () => {},
      hover: (i, n, cx, cy) => { mouse('mousemove', cx - n + i * 2, cy + (i % 7) * 3) },
      pan: (i, n, cx, cy) => {
        if (i === 0) mouse('mousedown', cx, cy, 1)
        mouse('mousemove', cx + i * 3, cy, 1)
        if (i === n - 1) mouse('mouseup', cx + i * 3, cy)
      },
      wheelpan: (i, n, cx, cy) => { wheel(cx, cy, i < n / 2 ? 40 : -40, 0) },
      zoom: (i, n, cx, cy) => { wheel(cx, cy, 0, (Math.floor(i / 20) % 2 === 0) ? -100 : 100) },
      // One zoom notch, then nothing: with a long settle window this shows how many
      // frames the chart keeps redrawing after the input stopped.
      settle: (i, _n, cx, cy) => { if (i === 0) wheel(cx, cy, 0, -100) },
      tick: (i) => {
        const last = bars[bars.length - 1]
        const close = last.close + Math.sin(i / 3) * 0.4
        live?.({ ...last, close, high: Math.max(last.high, close), low: Math.min(last.low, close) })
      },
      newbar: () => {
        const last = bars[bars.length - 1]
        const bar: CandleData = { ...last, timestamp: last.timestamp + 60000, open: last.close, close: last.close + 0.2, volume: 300 }
        bars.push(bar)
        live?.(bar)
      }
    }

    const api: BenchApi = {
      ready: false,
      info: { bars: barCount, path, ind },
      trace: async (frames = 60, scenario?: string) => {
        const fn = scenario !== undefined ? scenarios[scenario] : undefined
        const { cx, cy } = centre()
        traced.clear()
        tracing = true
        for (let i = 0; i < frames; i++) {
          await nextFrame()
          fn?.(i, frames, cx, cy)
        }
        tracing = false
        return [...traced.entries()]
          .map(([callback, v]) => ({ callback, frames: v.frames, totalMs: v.totalMs }))
          .sort((a, b) => b.frames - a.frames)
      },
      zoomOut: async (steps = 40) => {
        const { cx, cy } = centre()
        for (let i = 0; i < steps; i++) {
          await nextFrame()
          wheel(cx, cy, 0, 100)
        }
        for (let i = 0; i < 40; i++) await nextFrame()
      },
      run: async (scenario, inputFrames = 120, settleFrames = 20) => {
        const fn = scenarios[scenario]
        if (fn === undefined) throw new Error(`unknown scenario ${scenario}`)
        const { cx, cy } = centre()
        frameMs.clear()
        // The engine marks every layout pass; count them to see how often input forces one.
        let layouts = 0
        const marks = new PerformanceObserver(list => { layouts += list.getEntries().filter(e => e.name === 'astroneum:frame-start').length })
        marks.observe({ entryTypes: ['mark'] })
        recording = true
        for (let i = 0; i < inputFrames; i++) {
          await nextFrame()
          fn(i, inputFrames, cx, cy)
        }
        for (let i = 0; i < settleFrames; i++) await nextFrame()
        await nextFrame()
        recording = false
        marks.disconnect()
        const samples = [...frameMs.values()].sort((a, b) => a - b)
        const total = samples.reduce((sum, v) => sum + v, 0)
        const pick = (q: number): number => samples.length === 0 ? 0 : samples[Math.min(samples.length - 1, Math.floor(q * samples.length))]
        return {
          scenario,
          inputFrames,
          measuredFrames: inputFrames + settleFrames,
          drawFrames: samples.length,
          layouts,
          totalMs: total,
          meanMs: samples.length === 0 ? 0 : total / samples.length,
          p50Ms: pick(0.5),
          p95Ms: pick(0.95),
          maxMs: samples.length === 0 ? 0 : samples[samples.length - 1],
          longFrames: samples.filter(v => v > 16.7).length
        }
      }
    }
    window.__bench = api

    import('astroneum').then(mod => {
      setChart(() => mod.AstroneumChart)
      setConfig({ bars: barCount, path, ind })
      // Ready once the chart has subscribed (history loaded) and settled.
      const waitReady = (): void => {
        if (live === null) { setTimeout(waitReady, 50); return }
        setTimeout(() => {
          const probe = document.createElement('canvas')
          const gl = probe.getContext('webgl2')
          const dbg = gl?.getExtension('WEBGL_debug_renderer_info')
          api.info.renderer = gl === null || gl === undefined ? 'none' : (dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
          gl?.getExtension('WEBGL_lose_context')?.loseContext()
          api.info.canvases = document.querySelectorAll('.astroneum canvas').length
          api.info.glContexts = glContexts - 1
          api.info.devicePixelRatio = devicePixelRatio
          api.ready = true
        }, 600)
      }
      waitReady()
    }).catch((error: unknown) => { console.error(error) })
  }, [])

  if (Chart === null || config === null || datafeedRef.current === null) {
    return <p style={{ fontFamily: 'sans-serif', padding: 16 }}>Loading benchmark…</p>
  }
  const indicators = config.ind === 'none'
    ? { main: [] as Array<{ name: string, calcParams?: number[] }>, sub: [] as string[] }
    : { main: [{ name: 'EMA', calcParams: [7, 25, 99] }, { name: 'BOLL' }], sub: ['VOL', 'MACD', 'RSI'] }
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0d1117' }}>
      <Chart
        symbol={SYMBOL}
        period={PERIOD}
        datafeed={datafeedRef.current}
        theme="dark"
        mainIndicators={indicators.main}
        subIndicators={indicators.sub}
        drawingBarVisible={false}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  )
}
