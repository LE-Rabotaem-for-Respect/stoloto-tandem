import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { configureApp } from '../src/configure-app';
import { Clock, ClockModule, ClockStateSource, REAL_TIME } from '../src/core/clock';
import type { ClockState } from '../src/core/clock';
import { STAND_CONFIG, loadStandConfig } from '../src/core/config';
import type { StandConfig } from '../src/core/config';

const realNow = Date.parse('2026-10-19T05:00:00Z');

class FakeState extends ClockStateSource {
  reads = 0;
  constructor(public state: ClockState) {
    super();
  }
  async read() {
    this.reads += 1;
    return this.state;
  }
}

async function start(config: StandConfig, state: FakeState) {
  const moduleRef = await Test.createTestingModule({ imports: [ClockModule] })
    .overrideProvider(STAND_CONFIG)
    .useValue(config)
    .overrideProvider(ClockStateSource)
    .useValue(state)
    .overrideProvider(REAL_TIME)
    .useValue(() => realNow)
    .compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();
  return app;
}

// Первый запуск приложения Nest в процессе — загрузка и сканирование модулей — под нагрузкой
// параллельных файлов шёл больше 5 с и ронял первый тест по таймауту. Прогрев — в хуке с
// запасом, а у самих тестов остаётся обычный таймаут: долгий тест по-прежнему заметен.
const WARM_UP_TIMEOUT_MS = 60_000;

describe('core/clock: Clock — единственный источник «сейчас»', () => {
  let app: INestApplication | undefined;

  beforeAll(async () => {
    const warm = await start(
      { demoMode: false, standId: null },
      new FakeState({ offsetSeconds: 0, lastResetAt: null }),
    );
    await warm.close();
  }, WARM_UP_TIMEOUT_MS);

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('вне демо-режима сдвиг не применяется и база не читается', async () => {
    const state = new FakeState({ offsetSeconds: 86_400, lastResetAt: null });
    app = await start({ demoMode: false, standId: null }, state);
    expect(app.get(Clock).now().toISOString()).toBe('2026-10-19T05:00:00.000Z');
    expect(state.reads).toBe(0);
  });

  it('в демо-режиме сдвиг из базы загружен до приёма запросов', async () => {
    const state = new FakeState({ offsetSeconds: 3_600, lastResetAt: null });
    app = await start({ demoMode: true, standId: 'stand-1' }, state);
    expect(state.reads).toBe(1);
    expect(app.get(Clock).now().toISOString()).toBe('2026-10-19T06:00:00.000Z');
  });

  it('refresh() перечитывает сдвиг, now() остаётся синхронным', async () => {
    const state = new FakeState({ offsetSeconds: 0, lastResetAt: null });
    app = await start({ demoMode: true, standId: 'stand-1' }, state);
    const clock = app.get(Clock);
    state.state = { offsetSeconds: 2 * 86_400, lastResetAt: new Date('2026-10-19T04:00:00Z') };
    expect(clock.now().toISOString()).toBe('2026-10-19T05:00:00.000Z');
    await clock.refresh();
    expect(clock.now().toISOString()).toBe('2026-10-21T05:00:00.000Z');
    expect(clock.lastResetAt?.toISOString()).toBe('2026-10-19T04:00:00.000Z');
  });

  it('GET /clock: время сервера, режим, стенд и последний сброс', async () => {
    const state = new FakeState({
      offsetSeconds: 3_600,
      lastResetAt: new Date('2026-10-19T04:00:00Z'),
    });
    app = await start({ demoMode: true, standId: 'stand-2' }, state);
    const response = await request(app.getHttpServer()).get('/clock');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      now: '2026-10-19T06:00:00.000Z',
      demoMode: true,
      standId: 'stand-2',
      lastResetAt: '2026-10-19T04:00:00.000Z',
    });
  });

  it('заголовок X-Server-Time — на каждом ответе, в том числе на ошибке', async () => {
    const state = new FakeState({ offsetSeconds: 60, lastResetAt: null });
    app = await start({ demoMode: true, standId: null }, state);
    const ok = await request(app.getHttpServer()).get('/clock');
    const missing = await request(app.getHttpServer()).get('/no-such-route');
    expect(ok.headers['x-server-time']).toBe('2026-10-19T05:01:00.000Z');
    expect(missing.status).toBe(404);
    expect(missing.headers['x-server-time']).toBe('2026-10-19T05:01:00.000Z');
  });

  it('ответы без заголовка X-Powered-By', async () => {
    app = await start(
      { demoMode: false, standId: null },
      new FakeState({ offsetSeconds: 0, lastResetAt: null }),
    );
    const ok = await request(app.getHttpServer()).get('/clock');
    const missing = await request(app.getHttpServer()).get('/no-such-route');
    expect(ok.status).toBe(200);
    expect(ok.headers['x-powered-by']).toBeUndefined();
    expect(missing.headers['x-powered-by']).toBeUndefined();
  });
});

describe('core/config: настройки стенда из окружения', () => {
  it('демо-режим включает только DEMO_MODE=true', () => {
    expect(loadStandConfig({ DEMO_MODE: 'true' }).demoMode).toBe(true);
    for (const value of [undefined, '', 'false', 'TRUE', '1', 'yes']) {
      expect(loadStandConfig({ DEMO_MODE: value }).demoMode, String(value)).toBe(false);
    }
  });

  it('номер стенда без пробелов, пустой — null', () => {
    expect(loadStandConfig({ STAND_ID: ' stand-3 ' }).standId).toBe('stand-3');
    expect(loadStandConfig({ STAND_ID: '  ' }).standId).toBeNull();
    expect(loadStandConfig({}).standId).toBeNull();
  });
});
