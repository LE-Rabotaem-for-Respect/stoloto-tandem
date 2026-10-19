import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// esbuild не выводит метаданные декораторов, без которых не работает внедрение зависимостей NestJS
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/**/*.test.ts'],
  },
});
