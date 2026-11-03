#!/usr/bin/env node
// Drives the demo's /bench/ page in headless Chrome and prints how much
// main-thread time the chart spends drawing under pan, zoom, hover and
// live-tick input. Needs the demo running (pnpm dev, or a static export).
//
//   node scripts/render-bench.mjs [--url http://localhost:3000/bench/]
//        [--bars 20000] [--path auto|webgl|worker|canvas2d] [--ind default|none]
//        [--frames 120] [--settle 20] [--scenarios idle,hover,pan,wheelpan,zoom,settle,tick,newbar]
//        [--zoomout 40] [--repeat 3] [--trace] [--profile <scenario>|all]
//        [--json results.json] [--chrome /path/to/chrome]
//
//   --zoomout N  zoom out N wheel notches first, so many more bars are visible
//   --repeat N   run each scenario N times and report the median of each number
//   --settle N   frames to keep measuring after the input stops (use --frames 1 --settle 240
//                with the settle scenario to count frames drawn after one zoom notch)
//   --trace [scenario]  list which requestAnimationFrame callbacks run (idle by default)
//   --profile    sample the CPU during that scenario and print the hottest functions
//   --tree       with --profile, also print a top-down call tree
//   --metrics    also print Chrome's whole-page time per scenario (tasks, script, layout, style, GC)
//
// The GPU must stay enabled: with --disable-gpu, headless Chrome has no
// WebGL2 at all and every path silently becomes Canvas2D.

import { spawn } from 'node:child_process'
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1] ?? ''] : []).filter(p => p.length))
const url = args.url ?? 'http://localhost:3000/bench/'
const bars = Number(args.bars ?? 20000)
const path = args.path ?? 'auto'
const ind = args.ind ?? 'default'
const frames = Number(args.frames ?? 120)
const settle = Number(args.settle ?? 20)
const scenarios = (args.scenarios ?? 'idle,hover,pan,wheelpan,zoom,tick,newbar').split(',')
const chromePath = args.chrome ?? process.env.CHROME ?? (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : 'google-chrome')

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const port = 9400 + Math.floor(Math.random() * 400)
const profile = mkdtempSync(join(tmpdir(), 'astroneum-bench-'))
const chrome = spawn(chromePath, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--window-size=1280,900', '--hide-scrollbars', '--no-first-run', 'about:blank'
], { stdio: 'ignore' })
const cleanup = () => { try { chrome.kill() } catch {} setTimeout(() => rmSync(profile, { recursive: true, force: true }), 300) }
process.on('exit', cleanup)

let targets
for (let i = 0; i < 50; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.length) break } catch {}
  await sleep(200)
}
if (!targets?.length) { console.error('Chrome did not start'); process.exit(1) }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r))
let id = 0
const pending = new Map()
const errors = []
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text)
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' '))
})
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const evaluate = async (expression) => {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (res.result?.exceptionDetails) throw new Error(res.result.exceptionDetails.exception?.description ?? 'evaluate failed')
  return res.result?.result?.value
}

await send('Runtime.enable')
await send('Page.enable')
if ('metrics' in args) await send('Performance.enable')
const METRICS = ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'V8CompileDuration']
const readMetrics = async () => {
  if (!('metrics' in args)) return null
  const res = await send('Performance.getMetrics')
  return Object.fromEntries(res.result.metrics.filter(m => METRICS.includes(m.name)).map(m => [m.name, m.value]))
}
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
const target = `${url}${url.includes('?') ? '&' : '?'}bars=${bars}&path=${path}&ind=${ind}`
await send('Page.navigate', { url: target })

let ready = false
for (let i = 0; i < 300 && !ready; i++) { await sleep(200); ready = (await evaluate('window.__bench?.ready === true')) === true }
if (!ready) { console.error('bench page never became ready; is the demo running at', url, '?'); process.exit(1) }

if (args.zoomout) await evaluate(`window.__bench.zoomOut(${Number(args.zoomout)})`)
const info = await evaluate('window.__bench.info')

if ('trace' in args) {
  const traceScenario = args.trace && !args.trace.startsWith('--') ? args.trace : 'idle'
  const trace = await evaluate(`window.__bench.trace(60, ${JSON.stringify(traceScenario)})`)
  console.log(`\nrequestAnimationFrame callbacks over 60 frames of ${traceScenario}:`)
  for (const t of trace) console.log(`  ${String(t.frames).padStart(4)} frames ${t.totalMs.toFixed(1).padStart(7)} ms  ${t.callback}`)
}

let cpuProfile = null
const repeat = Math.max(1, Number(args.repeat ?? 1))
const results = []
for (const scenario of scenarios) {
  const profiling = args.profile === scenario || args.profile === 'all'
  if (profiling) {
    await send('Profiler.enable')
    await send('Profiler.setSamplingInterval', { interval: 100 })
    await send('Profiler.start')
  }
  const runs = []
  for (let i = 0; i < repeat; i++) {
    const before = await readMetrics()
    const run = await evaluate(`window.__bench.run(${JSON.stringify(scenario)}, ${frames}, ${settle})`)
    if (before !== null) {
      const after = await readMetrics()
      for (const key of METRICS) run[key] = (after[key] - before[key]) * 1000
    }
    runs.push(run)
  }
  results.push(median(runs))
  if (profiling) {
    const stopped = await send('Profiler.stop')
    await send('Profiler.disable')
    cpuProfile = mergeProfile(cpuProfile, stopped.result.profile)
  }
}

/** With --repeat, the median of each number across runs (runs are ranked by mean draw time). */
function median (runs) {
  if (runs.length === 1) return runs[0]
  const out = { ...runs[0], runs: runs.length }
  for (const key of Object.keys(runs[0])) {
    if (typeof runs[0][key] !== 'number') continue
    const values = runs.map(r => r[key]).sort((a, b) => a - b)
    out[key] = values[Math.floor(values.length / 2)]
  }
  return out
}

/**
 * Self and inclusive time per function from a CDP sampling profile. Bundlers
 * rewrite line numbers, so attribution is by name: anonymous frames are shown
 * with their nearest named callers, and inclusive time sums every sample whose
 * stack contains the function (once per sample).
 */
function summarise (p) {
  const byId = new Map(p.nodes.map(n => [n.id, n]))
  const parent = new Map()
  for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
  const label = (n) => n.callFrame.functionName || '(anonymous)'
  const named = (id) => {
    const names = []
    for (let cur = parent.get(id); cur !== undefined && names.length < 3; cur = parent.get(cur)) {
      const fn = byId.get(cur).callFrame.functionName
      if (fn && fn !== '(root)') names.push(fn)
    }
    return names
  }
  const self = new Map()
  const inclusive = new Map()
  let total = 0
  for (let i = 0; i < p.samples.length; i++) {
    const node = byId.get(p.samples[i])
    const dt = (p.timeDeltas[i] ?? 0) / 1000
    total += dt
    const key = `${label(node)}  ← ${named(node.id).join(' ← ') || '(root)'}`
    self.set(key, (self.get(key) ?? 0) + dt)
    const seen = new Set()
    for (let cur = node.id; cur !== undefined; cur = parent.get(cur)) {
      const fn = byId.get(cur).callFrame.functionName
      if (fn && fn !== '(root)' && !seen.has(fn)) { seen.add(fn); inclusive.set(fn, (inclusive.get(fn) ?? 0) + dt) }
    }
  }
  const sorted = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])
  // Top-down tree: inclusive ms per node, printed down to `minMs`.
  const nodeMs = new Map()
  for (let i = 0; i < p.samples.length; i++) {
    const dt = (p.timeDeltas[i] ?? 0) / 1000
    for (let cur = p.samples[i]; cur !== undefined; cur = parent.get(cur)) nodeMs.set(cur, (nodeMs.get(cur) ?? 0) + dt)
  }
  const tree = (minMs, maxDepth) => {
    const lines = []
    const walk = (id, depth) => {
      const n = byId.get(id)
      const ms = nodeMs.get(id) ?? 0
      if (ms < minMs || depth > maxDepth) return
      const fn = n.callFrame.functionName || '(anonymous)'
      if (fn !== '(root)' && fn !== '(idle)') lines.push(`${'  '.repeat(depth)}${ms.toFixed(0).padStart(5)} ms  ${fn}`)
      const kids = (n.children ?? []).slice().sort((a, b) => (nodeMs.get(b) ?? 0) - (nodeMs.get(a) ?? 0))
      for (const k of kids) walk(k, fn === '(root)' ? depth : depth + 1)
    }
    for (const n of p.nodes) if (!parent.has(n.id)) walk(n.id, 0)
    return lines
  }
  return { total, rows: sorted(self), inclusive: sorted(inclusive), tree }
}
function mergeProfile (a, b) {
  if (a === null) return b
  // Offset node ids so two profiles can be summarised together.
  const offset = Math.max(...a.nodes.map(n => n.id)) + 1
  return {
    nodes: a.nodes.concat(b.nodes.map(n => ({ ...n, id: n.id + offset }))),
    samples: a.samples.concat(b.samples.map(s => s + offset)),
    timeDeltas: a.timeDeltas.concat(b.timeDeltas)
  }
}

const fmt = (v) => v.toFixed(2).padStart(7)
console.log(`\n${info.bars} bars · path=${info.path} · indicators=${info.ind} · ${info.renderer}`)
console.log(`canvases=${info.canvases} glContexts=${info.glContexts} dpr=${info.devicePixelRatio} frames=${frames} repeat=${repeat}\n`)
console.log('scenario   draws layouts   total ms  mean ms   p50 ms   p95 ms   max ms  >16.7ms')
for (const r of results) {
  console.log(`${r.scenario.padEnd(9)} ${String(r.drawFrames).padStart(6)} ${String(r.layouts ?? '-').padStart(7)} ${fmt(r.totalMs).padStart(10)} ${fmt(r.meanMs)} ${fmt(r.p50Ms)} ${fmt(r.p95Ms)} ${fmt(r.maxMs)} ${String(r.longFrames).padStart(8)}`)
}
if ('metrics' in args) {
  console.log('\nwhole-page time per scenario, ms (Chrome Performance metrics):')
  console.log('scenario     tasks   script   layout    style  compile')
  for (const r of results) {
    console.log(`${r.scenario.padEnd(9)} ${fmt(r.TaskDuration ?? 0).padStart(8)} ${fmt(r.ScriptDuration ?? 0).padStart(8)} ${fmt(r.LayoutDuration ?? 0).padStart(8)} ${fmt(r.RecalcStyleDuration ?? 0).padStart(8)} ${fmt(r.V8CompileDuration ?? 0).padStart(8)}`)
  }
}
if (cpuProfile !== null) {
  const { total, rows, inclusive, tree } = summarise(cpuProfile)
  const busy = total - (rows.find(([k]) => k.startsWith('(idle)'))?.[1] ?? 0)
  console.log(`\nCPU profile (${args.profile}): ${busy.toFixed(0)} ms busy of ${total.toFixed(0)} ms sampled`)
  console.log('inclusive time by function (top 40):')
  for (const [fn, ms] of inclusive.slice(0, 40)) console.log(`  ${ms.toFixed(1).padStart(7)} ms ${(100 * ms / busy).toFixed(1).padStart(5)}%  ${fn}`)
  if ('tree' in args) {
    console.log('top-down (nodes ≥ 1% of busy, depth ≤ 9):')
    for (const line of tree(busy * 0.01, 9)) console.log('  ' + line)
  }
  console.log('self time (top 25):')
  for (const [key, ms] of rows.filter(([k]) => !k.startsWith('(idle)')).slice(0, 25)) console.log(`  ${ms.toFixed(1).padStart(7)} ms ${(100 * ms / busy).toFixed(1).padStart(5)}%  ${key}`)
}
if (errors.length) { console.log('\nconsole errors:'); for (const e of errors.slice(0, 5)) console.log(' ', e.slice(0, 200)) }
if (args.json) {
  writeFileSync(args.json, JSON.stringify({ info, frames, results, errors }, null, 2))
  console.log(`\nsaved ${args.json}`)
}
ws.close()
process.exit(0)
