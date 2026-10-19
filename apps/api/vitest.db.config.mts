import { defineConfig } from 'vitest/config';

// Тесты на настоящей PostgreSQL: на сервере из TEST_DATABASE_URL создаётся временная база
export default defineConfig({
  test: {
    include: ['test-db/**/*.test.ts'],
    globalSetup: ['test-db/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
