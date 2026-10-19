import { defineConfig } from 'tsdown';

// NestJS загружает пакет через require, Vite — через import, поэтому собираем оба формата.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  target: 'es2023',
});
