import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as source from '../src/index';

const dist = (file: string) => fileURLToPath(new URL(`../dist/${file}`, import.meta.url));

describe('сборка @tandem/domain', () => {
  it('содержит CommonJS и ES-модуль с типами', () => {
    for (const file of ['index.cjs', 'index.mjs', 'index.d.cts', 'index.d.mts']) {
      expect(existsSync(dist(file)), file).toBe(true);
    }
  });

  it('CommonJS-сборка загружается через require и совпадает с исходником', () => {
    const cjs = createRequire(import.meta.url)(dist('index.cjs')) as typeof source;
    expect(cjs).toMatchObject({ ...source });
  });

  it('ES-модуль загружается через import и совпадает с исходником', async () => {
    const esm = (await import(dist('index.mjs'))) as typeof source;
    expect({ ...esm }).toEqual({ ...source });
  });
});
