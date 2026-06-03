import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.test.js'],
    coverage: {
      include: ['src/**/*.js'],
      exclude: ['src/hooks/**'],
      reporter: ['text', 'lcov'],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
})
