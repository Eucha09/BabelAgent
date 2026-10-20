import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const root = import.meta.dirname

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(root, 'src/shared'),
      '@core': resolve(root, 'src/core')
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
})
