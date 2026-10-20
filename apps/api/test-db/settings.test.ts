import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { STAND_CONFIG } from '../src/core/config';
import { hashPassword } from '../src/modules/auth/password';
import { databaseUrl, prisma } from './db';

const COOKIE = 'tandem_session';
const PASSWORD = 'пароль-1234';

let app: INestApplication;
let passwordHash: string;
const http = () => request(app.getHttpServer());

/** Пользователь с настройками в базе и вход под ним. */
async function account(settings: object = {}) {
  const email = `user-${randomUUID()}@example.ru`;
  const user = await prisma.user.create({
    data: { name: 'Анна', email, passwordHash, settings, createdAt: new Date() },
  });
  const login = await http().post('/auth/login').send({ email, password: PASSWORD });
  if (login.status !== 200) throw new Error(`Вход не удался: ${login.status}`);
  const header = login.headers['set-cookie'] as unknown as string[];
  const cookie = header.find((line) => line.startsWith(`${COOKIE}=`))?.split(';')[0] ?? '';
  return { id: user.id, cookie };
}

const save = (cookie: string | null, body: object) => {
  const req = http().patch('/me/settings').send(body);
  return cookie ? req.set('Cookie', cookie) : req;
};

beforeAll(async () => {
  process.env.DATABASE_URL = databaseUrl;
  process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef';
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(STAND_CONFIG)
    .useValue({ demoMode: false, standId: null })
    .compile();
  app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();
  passwordHash = await hashPassword(PASSWORD);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('PATCH /me/settings — оформление в аккаунте', () => {
  it('сохраняет «Крупный текст» и «Высокий контраст»; /me отдаёт их после нового входа', async () => {
    const anna = await account();
    const first = await save(anna.cookie, { largeText: true });
    expect(first.status).toBe(200);
    expect(first.body.settings).toEqual({ theme: { largeText: true } });

    const second = await save(anna.cookie, { contrast: true });
    expect(second.body.settings).toEqual({ theme: { largeText: true, contrast: true } });

    const off = await save(anna.cookie, { largeText: false });
    expect(off.body.settings).toEqual({ theme: { largeText: false, contrast: true } });

    const me = await http().get('/me').set('Cookie', anna.cookie);
    expect(me.body.settings).toEqual({ theme: { largeText: false, contrast: true } });
  });

  it('другие настройки аккаунта не трогает', async () => {
    const anna = await account({ notifications: { email: false }, theme: { contrast: true } });
    const response = await save(anna.cookie, { largeText: true });
    expect(response.body.settings).toEqual({
      notifications: { email: false },
      theme: { contrast: true, largeText: true },
    });
  });

  it('одновременные изменения не теряются: в аккаунте остаются оба', async () => {
    for (let round = 0; round < 5; round++) {
      const anna = await account({ notifications: { email: false } });
      const responses = await Promise.all([
        save(anna.cookie, { largeText: true }),
        save(anna.cookie, { contrast: true }),
      ]);
      expect(responses.map((response) => response.status)).toEqual([200, 200]);
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: anna.id } });
      expect(stored.settings).toEqual({
        notifications: { email: false },
        theme: { largeText: true, contrast: true },
      });
    }
  });

  it('не объект в settings или theme — считается пустым', async () => {
    for (const settings of [[], { theme: 'крупно' }]) {
      const anna = await account(settings);
      const response = await save(anna.cookie, { contrast: true });
      expect(response.body.settings.theme).toEqual({ contrast: true });
    }
  });

  it.each([
    ['не да/нет', { largeText: 'да' }, 'largeText', '«Крупный текст» — да или нет'],
    ['null', { contrast: null }, 'contrast', '«Высокий контраст» — да или нет'],
    ['лишнее поле', { role: 'admin' }, 'role', 'Лишнее поле'],
  ])('%s — 400, настройки не меняются', async (_, body, field, message) => {
    const anna = await account({ theme: { largeText: true } });
    const response = await save(anna.cookie, body);
    expect(response.status).toBe(400);
    expect(response.body.fields).toEqual({ [field]: message });
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: anna.id } });
    expect(stored.settings).toEqual({ theme: { largeText: true } });
  });

  it('гостю — 401', async () => {
    expect((await save(null, { largeText: true })).status).toBe(401);
  });
});
