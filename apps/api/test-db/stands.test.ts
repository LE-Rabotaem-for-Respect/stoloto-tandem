import 'reflect-metadata';
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { REAL_TIME } from '../src/core/clock';
import { STAND_CONFIG } from '../src/core/config';
import { createPrismaClient } from '../src/core/prisma/prisma.service';
import { databaseUrl, prisma } from './db';

const realNow = Date.parse('2026-10-19T05:00:00Z');
// У каждого стенда своя временная база: общую базу тестов сброс стенда не трогает
const suffix = randomBytes(4).toString('hex');
const names = { 'stand-1': `tandem_stand1_${suffix}`, 'stand-2': `tandem_stand2_${suffix}` };
const urlOf = (name: string) => {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
};

// Стенд — отдельный экземпляр api со своей базой, как отдельный проект Compose
async function startStand(standId: string, url: string): Promise<INestApplication> {
  process.env.DATABASE_URL = url;
  process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef';
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(STAND_CONFIG)
    .useValue({ demoMode: true, standId })
    .overrideProvider(REAL_TIME)
    .useValue(() => realNow)
    .compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();
  return app;
}

const http = (app: INestApplication) => request(app.getHttpServer());
const clockOf = async (app: INestApplication) => (await http(app).get('/clock')).body;

let stand1: INestApplication;
let stand2: INestApplication;
const first = createPrismaClient(urlOf(names['stand-1']));
const other = createPrismaClient(urlOf(names['stand-2']));

beforeAll(async () => {
  for (const name of Object.values(names)) {
    await prisma.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    execSync('npx prisma migrate deploy', {
      cwd: resolve(__dirname, '..'),
      env: { ...process.env, DATABASE_URL: urlOf(name) },
      stdio: 'ignore',
    });
  }
  stand1 = await startStand('stand-1', urlOf(names['stand-1']));
  stand2 = await startStand('stand-2', urlOf(names['stand-2']));
  await Promise.all([
    http(stand1).post('/demo/reset').expect(200),
    http(stand2).post('/demo/reset').expect(200),
  ]);
}, 120_000);

afterAll(async () => {
  await Promise.all([stand1?.close(), stand2?.close()]);
  await Promise.all([first.$disconnect(), other.$disconnect()]);
  for (const name of Object.values(names)) {
    await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  }
});

describe('изоляция демо-стендов (ТЗ 4.6)', () => {
  it('каждый стенд отдаёт свой номер — его показывает демо-панель', async () => {
    expect((await clockOf(stand1)).standId).toBe('stand-1');
    expect((await clockOf(stand2)).standId).toBe('stand-2');
  });

  it('перемотка часов на одном стенде не сдвигает другой', async () => {
    await http(stand2).post('/demo/clock').send({ addSeconds: 86_400 }).expect(200);
    expect(Date.parse((await clockOf(stand2)).now)).toBe(realNow + 86_400_000);
    expect(Date.parse((await clockOf(stand1)).now)).toBe(realNow);
    expect(
      (await other.appState.findUniqueOrThrow({ where: { id: true } })).clockOffsetSeconds,
    ).toBe(86_400);
    expect(
      (await first.appState.findUniqueOrThrow({ where: { id: true } })).clockOffsetSeconds,
    ).toBe(0);
  });

  it('сброс на одном стенде не трогает данные и часы другого', async () => {
    const marker = await other.user.create({
      data: {
        name: 'Только на stand-2',
        email: `marker-${suffix}@example.ru`,
        passwordHash: 'hash',
        createdAt: new Date(realNow),
      },
    });
    const before2 = await clockOf(stand2);

    await http(stand1).post('/demo/reset').expect(200);

    expect(await other.user.findUnique({ where: { id: marker.id } })).not.toBeNull();
    expect(await clockOf(stand2)).toEqual(before2);
  });
});
