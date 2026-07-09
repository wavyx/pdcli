import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.test.js'],
    setupFiles: ['test/setup.js'],
    // The client retry tests exercise real exponential backoff (sleeps that
    // sum to ~14s in the worst-case exhaustion path), so the 5s default is too
    // tight; give generous headroom, more so on coverage-instrumented CI.
    testTimeout: 30000,
    hookTimeout: 30000,
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
