/// <reference types="vite/client" />

import path from 'path'
import { defineConfig } from 'vite'
import reactPlugin from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [
    reactPlugin(),
    dts({
      include: ['src'],
      exclude: ['src/**/__tests__/**'],
      outDir: 'dist',
      rollupTypes: true,
    }),
  ],
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') }
    ]
  },
  build: {
    target: 'esnext',
    cssTarget: 'chrome61',
    sourcemap: true,
    rollupOptions: {
      external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
      output: {
        assetFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'style.css') {
            return 'astroneum.css'
          }
          return '[name][extname]'
        }
      },
    },
    lib: {
      entry: './src/index.ts',
      formats: ['es'],
      fileName: 'astroneum'
    }
  }
})
