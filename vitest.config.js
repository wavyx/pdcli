import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.test.js'],
    setupFiles: ['test/setup.js'],
    // node-jq shells out to the jq binary; its subprocess cold-start under
    // coverage instrumentation on shared CI runners can spike well past the
    // 5s default, timing out --jq tests that run in ~30ms locally. Give CI
    // headroom without masking a genuine hang.
    testTimeout: 20000,
    hookTimeout: 20000,
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
