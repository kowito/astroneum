/// <reference types="node" />

import { fileURLToPath } from 'node:url'
import { readFileSync, writeFileSync } from 'node:fs'

import { defineConfig } from 'tsup'

const srcDir = fileURLToPath(new URL('./src', import.meta.url))

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/entries/replay.ts',
    'src/entries/multichart.ts',
    'src/entries/watchlist.ts',
    'src/entries/portfolio.ts',
    'src/entries/alerts.ts',
    'src/entries/script.ts',
    'src/entries/datafeeds/polygon.ts',
    'src/entries/datafeeds/crypto.ts',
    'src/entries/datafeeds/webtransport.ts',
  ],
  format: ['esm'],
  dts: true,
  sourcemap: false,
  minify: true,
  target: 'esnext',
  outDir: 'dist',
  clean: false,
  splitting: true,
  treeshake: true,
  external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
  esbuildOptions (options) {
    options.jsx = 'automatic'
    options.jsxImportSource = 'react'
    options.alias = {
      ...(options.alias ?? {}),
      '@': srcDir
    }
    options.loader = {
      ...(options.loader ?? {}),
      '.less': 'empty',
      '.svg': 'text'
    }
  },
  async onSuccess () {
    // esbuild strips 'use client' during bundling; inject it as a post-build
    // step so Next.js App Router treats every emitted entry as a Client
    // Module — including subpath entries under dist/entries/**.
    const { readdirSync, statSync } = await import('node:fs')
    const path = await import('node:path')
    const walk = (dir: string): string[] => {
      const out: string[] = []
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name)
        if (statSync(full).isDirectory()) out.push(...walk(full))
        else if (name.endsWith('.js')) out.push(full)
      }
      return out
    }
    for (const outFile of walk('dist')) {
      const content = readFileSync(outFile, 'utf8')
      if (!content.startsWith("'use client';")) {
        writeFileSync(outFile, `'use client';\n${content}`)
      }
    }
  },
})
