import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DEMO_ACCOUNT_KEYS, demoAccountEmail } from '@tandem/domain';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { REAL_TIME } from '../src/core/clock';
import { STAND_CONFIG } from '../src/core/config';
import { verifyPassword } from '../src/modules/auth/password';
import { RESET_TABLES } from '../src/modules/demo';
import { DemoService } from '../src/modules/demo/demo.service';
import { runSeed } from '../src/seed';
import { databaseUrl, prisma } from './db';

const realNow = Date.parse('2026-10-19T05:00:00Z');
const day = 86_400_000;

async function startApp(demoMode: boolean): Promise<INestApplication> {
  process.env.DATABASE_URL = databaseUrl;
  process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef';
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(STAND_CONFIG)
    .useValue({ demoMode, standId: 'stand-1' })
    .overrideProvider(REAL_TIME)
    .useValue(() => realNow)
    .compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();
  return app;
}

/** Состав базы без id: что видит эксперт после сброса. */
async function snapshot() {
  const [users, organizations, sports, interests] = await Promise.all([
    prisma.user.findMany({
      select: { email: true, role: true, name: true, settings: true, createdAt: true },
      orderBy: { email: 'asc' },
    }),
    prisma.organization.findMany({
      select: {
        name: true,
        status: true,
        submittedAt: true,
        decidedAt: true,
        decisionReason: true,
        owner: { select: { email: true } },
        decidedBy: { select: { email: true } },
        sports: { select: { sport: { select: { name: true } } } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.sport.findMany({
      select: { name: true, normalizedName: true, aliases: true, category: true, isCustom: true },
      orderBy: { normalizedName: 'asc' },
    }),
    prisma.userSport.count(),
  ]);
  return { users, organizations, sports, interests };
}

let app: INestApplication | undefined;

// Первый запуск приложения Nest в процессе — самый долгий: прогрев в хуке с запасом,
// чтобы холодный старт не съедал время первого теста (каждый тест поднимает своё приложение)
const WARM_UP_TIMEOUT_MS = 60_000;

beforeAll(async () => {
  // Вне демо-режима приложение при старте в базу не ходит
  const warm = await startApp(false);
  await warm.close();
}, WARM_UP_TIMEOUT_MS);

afterEach(async () => {
  await app?.close();
  app = undefined;
});

afterAll(async () => {
  await prisma.appState.update({
    where: { id: true },
    data: { clockOffsetSeconds: 0, lastResetAt: null },
  });
  await prisma.$disconnect();
});

describe('POST /demo/reset — минимальный сид', () => {
  it('создаёт демо-аккаунты с паролем demo и организации в статусах ТЗ 4.6', async () => {
    app = await startApp(true);
    const response = await request(app.getHttpServer()).post('/demo/reset');
    expect(response.status).toBe(200);

    const users = await prisma.user.findMany({ include: { organization: true } });
    expect(users.map((user) => user.email)).toEqual(
      expect.arrayContaining(DEMO_ACCOUNT_KEYS.map(demoAccountEmail)),
    );
    const byEmail = new Map(users.map((user) => [user.email, user]));
    const anna = byEmail.get('anna@demo');
    expect(anna && (await verifyPassword('demo', anna.passwordHash))).toBe(true);
    expect(byEmail.get('admin@demo')?.role).toBe('admin');
    expect(byEmail.get('petr@demo')?.settings).toEqual({ text: 'large' });

    const admin = byEmail.get('admin@demo');
    const ladya = byEmail.get('ladya@demo')?.organization;
    expect(ladya?.status).toBe('approved');
    expect(ladya?.decidedById).toBe(admin?.id);
    expect(byEmail.get('padel@demo')?.organization?.status).toBe('pending');
    expect(byEmail.get('stolby@demo')?.organization?.status).toBe('pending');
    const yoga = byEmail.get('yoga@demo')?.organization;
    expect(yoga?.status).toBe('rejected');
    expect(yoga?.decisionReason).toMatch(/[А-Яа-я]/);

    const catalog = await prisma.sport.findMany({ where: { isCustom: false } });
    expect(catalog.length).toBeGreaterThanOrEqual(23);
    expect(new Set(catalog.map((sport) => sport.category)).size).toBe(8);
    expect(catalog.every((sport) => sport.status === 'active')).toBe(true);
    expect(await prisma.userSport.count({ where: { userId: anna?.id } })).toBe(2);
  });

  it('даты строятся от Clock.now()', async () => {
    app = await startApp(true);
    await request(app.getHttpServer()).post('/demo/reset');
    const padel = await prisma.organization.findFirstOrThrow({
      where: { owner: { email: 'padel@demo' } },
      include: { owner: true },
    });
    expect(padel.submittedAt?.getTime()).toBe(realNow - 2 * day);
    expect(padel.owner.createdAt.getTime()).toBe(realNow - 3 * day);
  });

  it('повторный сброс возвращает ровно исходное состояние', async () => {
    app = await startApp(true);
    await request(app.getHttpServer()).post('/demo/reset');
    const initial = await snapshot();

    await prisma.user.create({
      data: {
        name: 'Гость',
        email: 'guest@test.local',
        passwordHash: 'x',
        createdAt: new Date(realNow),
      },
    });
    await prisma.organization.updateMany({ data: { status: 'approved' } });
    await prisma.sport.create({
      data: { name: 'Кёрлинг', normalizedName: 'керлинг', isCustom: true },
    });

    await request(app.getHttpServer()).post('/demo/reset');
    expect(await snapshot()).toEqual(initial);
  });

  it('обнуляет сдвиг часов и запоминает время сброса', async () => {
    app = await startApp(true);
    await request(app.getHttpServer()).post('/demo/clock').send({ addSeconds: 86_400 });
    const response = await request(app.getHttpServer()).post('/demo/reset');
    expect(response.body).toEqual({ lastResetAt: '2026-10-19T05:00:00.000Z' });

    const clock = await request(app.getHttpServer()).get('/clock');
    expect(clock.body).toMatchObject({
      now: '2026-10-19T05:00:00.000Z',
      lastResetAt: '2026-10-19T05:00:00.000Z',
    });
    expect(await prisma.appState.findUniqueOrThrow({ where: { id: true } })).toMatchObject({
      clockOffsetSeconds: 0,
    });
  });

  it('доступен гостю, но не со страницы чужого сайта', async () => {
    app = await startApp(true);
    await request(app.getHttpServer()).post('/demo/reset');
    const before = await snapshot();
    await prisma.organization.updateMany({ data: { status: 'approved' } });
    const changed = await snapshot();
    const response = await request(app.getHttpServer())
      .post('/demo/reset')
      .set('Sec-Fetch-Site', 'cross-site');
    expect(response.status).toBe(403);
    expect(await snapshot()).toEqual(changed);
    expect(changed).not.toEqual(before);
  });

  it('после сброса работает быстрый вход', async () => {
    app = await startApp(true);
    await request(app.getHttpServer()).post('/demo/reset');
    const login = await request(app.getHttpServer())
      .post('/auth/demo-login')
      .send({ account: 'ladya' });
    expect(login.status).toBe(200);
  });

  it('очищает все таблицы данных, кроме настроек стенда и журнала миграций', async () => {
    const rows = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = current_schema()`;
    const tables = rows
      .map((row) => row.tablename)
      .filter((name) => name !== 'app_state' && name !== '_prisma_migrations');
    expect([...RESET_TABLES].sort()).toEqual(tables.sort());
  });
});

describe('POST /demo/clock — перемотка демо-часов', () => {
  it('сдвигает Clock.now() вперёд и хранит сдвиг в базе стенда', async () => {
    app = await startApp(true);
    await request(app.getHttpServer()).post('/demo/reset');
    const hour = await request(app.getHttpServer()).post('/demo/clock').send({ addSeconds: 3_600 });
    expect(hour.status).toBe(200);
    expect(hour.body.now).toBe('2026-10-19T06:00:00.000Z');
    await request(app.getHttpServer()).post('/demo/clock').send({ addSeconds: 86_400 });
    const clock = await request(app.getHttpServer()).get('/clock');
    expect(clock.body.now).toBe('2026-10-20T06:00:00.000Z');
    expect(await prisma.appState.findUniqueOrThrow({ where: { id: true } })).toMatchObject({
      clockOffsetSeconds: 90_000,
    });
  });

  it('общий сдвиг не больше 10 лет: дальше — ошибка поля, сдвиг не меняется', async () => {
    app = await startApp(true);
    const nearLimit = 10 * 365 * 86_400 - 3_600;
    await prisma.appState.update({ where: { id: true }, data: { clockOffsetSeconds: nearLimit } });
    const response = await request(app.getHttpServer())
      .post('/demo/clock')
      .send({ addSeconds: 86_400 });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: 'validation_failed',
      fields: { addSeconds: expect.stringMatching(/[А-Яа-я]/) },
    });
    expect(await prisma.appState.findUniqueOrThrow({ where: { id: true } })).toMatchObject({
      clockOffsetSeconds: nearLimit,
    });
    await request(app.getHttpServer()).post('/demo/reset');
  });

  it.each([0, -3_600, 1.5, 400 * 86_400, 'час'])('отклоняет сдвиг %s', async (addSeconds) => {
    app = await startApp(true);
    const response = await request(app.getHttpServer()).post('/demo/clock').send({ addSeconds });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('validation_failed');
  });
});

describe('частота сброса', () => {
  async function startWithInterval(seconds: number, now: () => number) {
    process.env.DATABASE_URL = databaseUrl;
    process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(STAND_CONFIG)
      .useValue({ demoMode: true, standId: 'stand-1', demoResetIntervalSeconds: seconds })
      .overrideProvider(REAL_TIME)
      .useValue(now)
      .compile();
    const started = configureApp(moduleRef.createNestApplication({ logger: false }));
    await started.init();
    return started;
  }

  it('два одновременных сброса — выполняется один, оба получают его результат', async () => {
    app = await startWithInterval(0, () => realNow);
    const reset = vi.spyOn(app.get(DemoService), 'reset');
    const [first, second] = await Promise.all([
      request(app.getHttpServer()).post('/demo/reset'),
      request(app.getHttpServer()).post('/demo/reset'),
    ]);
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(second.body).toEqual(first.body);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('повтор в интервале — 429 с Retry-After, после интервала — снова можно', async () => {
    let now = realNow;
    app = await startWithInterval(10, () => now);
    expect((await request(app.getHttpServer()).post('/demo/reset')).status).toBe(200);

    now += 4_000;
    const early = await request(app.getHttpServer()).post('/demo/reset');
    expect(early.status).toBe(429);
    expect(early.body.code).toBe('too_many_requests');
    expect(early.headers['retry-after']).toBe('6');

    now += 6_000;
    expect((await request(app.getHttpServer()).post('/demo/reset')).status).toBe(200);

    // Часы перевели назад: это не «только что сброшены»
    now -= 3_600_000;
    expect((await request(app.getHttpServer()).post('/demo/reset')).status).toBe(200);
  });
});

describe('вне DEMO_MODE', () => {
  it('ручки сброса и перемотки отвечают 404 и ничего не меняют', async () => {
    app = await startApp(true);
    await request(app.getHttpServer()).post('/demo/reset');
    await app.close();
    app = await startApp(false);
    const before = await snapshot();
    const reset = await request(app.getHttpServer()).post('/demo/reset');
    const clock = await request(app.getHttpServer()).post('/demo/clock').send({ addSeconds: 60 });
    expect(reset.status).toBe(404);
    expect(reset.body.code).toBe('not_found');
    expect(clock.status).toBe(404);
    expect(await snapshot()).toEqual(before);
  });
});

describe('команда seed для нового стенда', () => {
  beforeAll(() => {
    process.env.DATABASE_URL = databaseUrl;
  });

  const truncate = () =>
    prisma.$executeRawUnsafe(`TRUNCATE ${RESET_TABLES.map((t) => `"${t}"`).join(', ')} CASCADE`);

  it('в демо-режиме заполняет пустую базу', async () => {
    await truncate();
    expect(await runSeed({ demoMode: true, standId: null })).toBe('seeded');
    expect(await prisma.user.count()).toBe(DEMO_ACCOUNT_KEYS.length + 10);
  });

  it('не трогает базу, где уже есть данные', async () => {
    const before = await snapshot();
    expect(await runSeed({ demoMode: true, standId: null })).toBe('not_empty');
    expect(await snapshot()).toEqual(before);
  });

  it('вне демо-режима демо-аккаунты не создаёт', async () => {
    await truncate();
    expect(await runSeed({ demoMode: false, standId: null })).toBe('not_demo');
    expect(await prisma.user.count()).toBe(0);
  });

  it('старт приложения сам базу не заполняет', async () => {
    await truncate();
    app = await startApp(true);
    expect(await prisma.user.count()).toBe(0);
  });
});
