import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    // Integration suites share one disposable PostgreSQL database. Some
    // Stage 3 fixtures temporarily relax a partial unique index to simulate
    // legacy data, so test files must not run in parallel against it.
    fileParallelism: false,
  },
});
