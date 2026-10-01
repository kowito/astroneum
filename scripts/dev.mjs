#!/usr/bin/env node
// `pnpm dev` — run the demo site in development.
//
// The demo (./demo) imports `astroneum` through the workspace link, which
// resolves to ./dist. So dev mode needs three things running side by side:
//   lib   tsup --watch          rebuilds dist/**/*.js when src/ changes
//   css   build:css on change   rebuilds dist/astroneum.css when styles change
//   demo  next dev              serves the demo with HMR
// If dist/ doesn't exist yet it is built once up front so the demo can start.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, watch } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const isWin = process.platform === 'win32'
const pnpm = isWin ? 'pnpm.cmd' : 'pnpm'
const DEMO_PACKAGE = 'astroneum-demo-next'

if (!existsSync(path.join(root, 'dist/index.js')) || !existsSync(path.join(root, 'dist/astroneum.css'))) {
  console.log('[dev] dist/ not found — building the library first…')
  const build = spawnSync(pnpm, ['build'], { cwd: root, stdio: 'inherit', shell: isWin })
  if (build.status !== 0) process.exit(build.status ?? 1)
}

const children = []
let shuttingDown = false

function run (name, args) {
  // POSIX: give each child its own process group so the whole tree
  // (pnpm → tsup / next → workers) can be stopped with one signal.
  const child = spawn(pnpm, args, { cwd: root, stdio: 'inherit', shell: isWin, detached: !isWin })
  children.push(child)
  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    console.error(`[dev] ${name} exited (${signal ?? code}) — shutting down`)
    shutdown(code ?? 1)
  })
  return child
}

function stop (child, signal) {
  if (child.exitCode !== null || child.signalCode !== null) return
  try {
    if (isWin) child.kill(signal)
    else process.kill(-child.pid, signal)
  } catch {
    // already gone
  }
}

function shutdown (code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) stop(child, 'SIGTERM')
  // Don't hang if something ignores SIGTERM.
  setTimeout(() => {
    for (const child of children) stop(child, 'SIGKILL')
    process.exit(code)
  }, 3000).unref()
  Promise.all(children.map(child => new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) resolve()
    else child.once('exit', resolve)
  }))).then(() => process.exit(code))
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

// lib: JS bundles
run('lib', ['exec', 'tsup', '--config', 'tsup.config.ts', '--watch', 'src'])

// css: sass + esbuild bundle (fonts inlined), debounced
let cssTimer
let cssBuilding = false
let cssQueued = false
function buildCss () {
  if (cssBuilding) { cssQueued = true; return }
  cssBuilding = true
  const proc = spawn(pnpm, ['build:css'], { cwd: root, stdio: 'inherit', shell: isWin })
  proc.on('exit', (code) => {
    cssBuilding = false
    if (code === 0) console.log('[dev] css rebuilt')
    if (cssQueued) { cssQueued = false; buildCss() }
  })
}
try {
  watch(path.join(root, 'src'), { recursive: true }, (_event, filename) => {
    if (!filename || !/\.(scss|css)$/.test(filename)) return
    // build:css writes (then deletes) src/styles/.tmp-astroneum.css — ignore it,
    // otherwise every build retriggers itself.
    if (path.basename(filename).startsWith('.tmp-')) return
    clearTimeout(cssTimer)
    cssTimer = setTimeout(buildCss, 150)
  })
} catch (err) {
  console.warn(`[dev] style watching unavailable (${err.message}) — restart \`pnpm dev\` after editing .scss files`)
}

// demo: Next.js dev server
run('demo', ['--filter', DEMO_PACKAGE, 'dev'])
