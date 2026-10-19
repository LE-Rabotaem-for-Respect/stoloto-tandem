import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as source from '../src/index';

const dist = (file: string) => fileURLToPath(new URL(`../dist/${file}`, import.meta.url));

/**
 * Сборка и исходник — разные экземпляры функций и классов, поэтому сравниваем
 * набор экспортов, их типы и данные (функции при сериализации отбрасываются),
 * а поведение — вызовом.
 */
function shape(module: Record<string, unknown>) {
  return Object.fromEntries(
    Object.keys(source).map((name) => [
      name,
      { type: typeof module[name], data: JSON.stringify(module[name]) },
    ]),
  );
}

function behaviour(module: typeof source) {
  return {
    normalized: module.normalizeSportName('  Ёлки  Палки '),
    joined: module.participationMachine.nextState(null, 'join', { mode: 'free', hasSeats: false }),
    error: (() => {
      try {
        module.participationMachine.nextState('rejected', 'join', { mode: 'free', hasSeats: true });
      } catch (error) {
        return error instanceof module.TransitionError ? error.code : 'не TransitionError';
      }
      return 'нет ошибки';
    })(),
    today: module.todayRange(new Date('2026-10-19T10:00:00Z')).from.toISOString(),
  };
}

describe('сборка @tandem/domain', () => {
  it('содержит CommonJS и ES-модуль с типами', () => {
    for (const file of ['index.cjs', 'index.mjs', 'index.d.cts', 'index.d.mts']) {
      expect(existsSync(dist(file)), file).toBe(true);
    }
  });

  it('CommonJS-сборка загружается через require и совпадает с исходником', () => {
    const cjs = createRequire(import.meta.url)(dist('index.cjs')) as typeof source;
    expect(shape(cjs)).toEqual(shape(source));
    expect(behaviour(cjs)).toEqual(behaviour(source));
  });

  it('ES-модуль загружается через import и совпадает с исходником', async () => {
    const esm = (await import(dist('index.mjs'))) as typeof source;
    expect(Object.keys(esm).sort()).toEqual(Object.keys(source).sort());
    expect(shape(esm)).toEqual(shape(source));
    expect(behaviour(esm)).toEqual(behaviour(source));
  });
});
