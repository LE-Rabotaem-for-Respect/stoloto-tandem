import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { REAL_TIME } from '../src/core/clock';
import { AUTH_LIMITS } from '../src/modules/auth/attempt-limiter';
import { PasswordHasher } from '../src/modules/auth/password-hasher';
import { databaseUrl, prisma } from './db';

const MINUTE = 60_000;
const clock = { now: Date.parse('2026-10-19T12:00:00Z') };
let app: INestApplication;

beforeAll(async () => {
  process.env.DATABASE_URL = databaseUrl;
  process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef';
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AUTH_LIMITS)
    .useValue({
      loginPerIp: { attempts: 5, windowMs: 10 * MINUTE },
      loginPerEmail: { attempts: 3, windowMs: 10 * MINUTE },
      registerPerIp: { attempts: 2, windowMs: 60 * MINUTE },
      registerPerEmail: { attempts: 2, windowMs: 60 * MINUTE },
    })
    .overrideProvider(REAL_TIME)
    .useValue(() => clock.now)
    .compile();
  app = configureApp(moduleRef.createNestApplication());
  await app.init();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

// Адрес клиента приходит от nginx в X-Forwarded-For; тест подключается с loopback — ему доверяют
const from = (ip: string) => ({ 'X-Forwarded-For': ip });
const login = (ip: string, email: string) =>
  request(app.getHttpServer())
    .post('/auth/login')
    .set(from(ip))
    .send({ email, password: 'не тот' });
const register = (ip: string, email: string) =>
  request(app.getHttpServer())
    .post('/auth/register')
    .set(from(ip))
    .send({ accountType: 'person', name: 'Анна', email, password: 'пароль-1234' });

describe('лимиты попыток входа и регистрации', () => {
  it('по почте: сверх лимита — 429 с Retry-After, даже с другого адреса', async () => {
    const email = `anna-${randomUUID()}@example.ru`;
    for (const ip of ['198.51.100.1', '198.51.100.2', '198.51.100.3']) {
      expect((await login(ip, email)).status).toBe(401);
    }
    const blocked = await login('198.51.100.4', email);
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      code: 'too_many_requests',
      message: 'Слишком много попыток. Попробуйте через 10 мин',
    });
    expect(blocked.headers['retry-after']).toBe('600');
  });

  it('по адресу: сверх лимита — 429; другой адрес не задет; после окна — снова можно', async () => {
    const ip = '203.0.113.7';
    for (let i = 0; i < 5; i += 1) {
      expect((await login(ip, `x${i}-${randomUUID()}@example.ru`)).status).toBe(401);
    }
    expect((await login(ip, `y-${randomUUID()}@example.ru`)).status).toBe(429);
    expect((await login('203.0.113.8', `z-${randomUUID()}@example.ru`)).status).toBe(401);

    clock.now += 10 * MINUTE;
    expect((await login(ip, `w-${randomUUID()}@example.ru`)).status).toBe(401);
  });

  it('регистрация: лимит по адресу; занятая почта — 409 без вычисления хеша', async () => {
    const hash = vi.spyOn(app.get(PasswordHasher), 'hash');
    const ip = '192.0.2.10';
    const email = `taken-${randomUUID()}@example.ru`;
    expect((await register(ip, email)).status).toBe(201);
    expect(hash).toHaveBeenCalledTimes(1);

    const taken = await register(ip, email.toUpperCase());
    expect(taken.status).toBe(409);
    expect(taken.body.fields).toEqual({ email: 'Эта почта уже зарегистрирована' });
    expect(hash).toHaveBeenCalledTimes(1);

    const blocked = await register(ip, `next-${randomUUID()}@example.ru`);
    expect(blocked.status).toBe(429);
    expect(hash).toHaveBeenCalledTimes(1);
    hash.mockRestore();
  });

  it('регистрация: лимит по почте — с другого адреса тоже 429', async () => {
    const email = `busy-${randomUUID()}@example.ru`;
    expect((await register('192.0.2.20', email)).status).toBe(201);
    expect((await register('192.0.2.21', email)).status).toBe(409);
    expect((await register('192.0.2.22', email)).status).toBe(429);
  });

  it('адрес клиента — самый правый недоверенный: подставленные левее значения не обходят лимит', async () => {
    // trust proxy доверяет только внутренним адресам: публичный адрес в цепочке и есть клиент
    const ip = '203.0.113.50';
    for (let i = 0; i < 5; i += 1) {
      await login(`10.0.0.${i}, ${ip}`, `chain${i}-${randomUUID()}@example.ru`);
    }
    expect((await login(`10.9.9.9, ${ip}`, `last-${randomUUID()}@example.ru`)).status).toBe(429);
  });
});
