import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

describe('GET /health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Маршрут не обращается к базе, а клиент Prisma подключается только при первом запросе
    process.env.DATABASE_URL ??= 'postgresql://unused@127.0.0.1:1/unused';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('отвечает 200 и состоянием сервиса', async () => {
    const response = await request(app.getHttpServer()).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', timeZone: 'Asia/Krasnoyarsk' });
  });
});
