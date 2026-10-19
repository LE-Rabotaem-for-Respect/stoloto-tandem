import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Тесты на настоящей PostgreSQL: на сервере из TEST_DATABASE_URL создаётся временная база.
// swc — для метаданных декораторов: тесты маршрутов поднимают приложение NestJS
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test-db/**/*.test.ts'],
    globalSetup: ['test-db/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
