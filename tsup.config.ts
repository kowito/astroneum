/// <reference types="node" />

import { fileURLToPath } from 'node:url'

import { defineConfig } from 'tsup'

const srcDir = fileURLToPath(new URL('./src', import.meta.url))

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: false,
  minify: true,
  target: 'esnext',
  outDir: 'dist',
  clean: false,
  splitting: false,
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
  }
})
