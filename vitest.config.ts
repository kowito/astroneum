import path from 'node:path'
import { defineConfig } from 'vitest/config'
import reactPlugin from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [reactPlugin()],
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') }
    ]
  },
  test: {
    environment: 'jsdom',
    globals: true
  }
})
