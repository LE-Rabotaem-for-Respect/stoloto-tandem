import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PUBLIC_KEY, ROLES_KEY } from '../src/core/access';
import { ClockStateSource } from '../src/core/clock';
import { SportsRepository } from '../src/modules/sports/sports.repository';

interface Route {
  name: string;
  method: RequestMethod;
  handler: object;
  controller: object;
}

const WRITES = [RequestMethod.POST, RequestMethod.PUT, RequestMethod.PATCH, RequestMethod.DELETE];

// Все маршруты приложения: контроллеры всех модулей и их методы с HTTP-методом
function collectRoutes(modules: ModulesContainer): Route[] {
  const routes: Route[] = [];
  for (const module of modules.values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype as (new (...args: never[]) => object) | null;
      if (!controller) continue;
      const prototype = controller.prototype as Record<string, unknown>;
      for (const key of Object.getOwnPropertyNames(prototype)) {
        const handler = prototype[key];
        if (key === 'constructor' || typeof handler !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        if (method === undefined || path === undefined) continue;
        routes.push({ name: `${controller.name}.${key}`, method, handler, controller });
      }
    }
  }
  return routes;
}

describe('метки доступа маршрутов', () => {
  let routes: Route[];
  let close: () => Promise<void>;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= 'postgresql://unused@127.0.0.1:1/unused';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    routes = collectRoutes(moduleRef.get(ModulesContainer));
    close = () => moduleRef.close();
  });

  afterAll(async () => {
    await close();
  });

  it('найдены все маршруты всех контроллеров', () => {
    expect(routes.map((route) => route.name)).toEqual(
      expect.arrayContaining([
        'AuthController.register',
        'AuthController.login',
        'AuthController.demoLogin',
        'AuthController.logout',
        'AuthController.me',
        'ClockController.get',
        'HealthController.check',
        'SportsController.search',
      ]),
    );
  });

  it('@Public не стоит ни на одном контроллере', () => {
    const controllers = new Set(routes.map((route) => route.controller));
    const marked = [...controllers].filter((controller) =>
      Reflect.getMetadata(PUBLIC_KEY, controller),
    );
    expect(marked.map((controller) => (controller as { name: string }).name)).toEqual([]);
  });

  it('у каждого изменяющего маршрута метка доступа стоит на самом методе', () => {
    const unmarked = routes
      .filter((route) => WRITES.includes(route.method))
      .filter(
        (route) =>
          !Reflect.getMetadata(PUBLIC_KEY, route.handler) &&
          !Reflect.getMetadata(ROLES_KEY, route.handler),
      )
      .map((route) => route.name);
    expect(unmarked).toEqual([]);
  });
});

describe('гость и открытые маршруты (приложение целиком, с guard)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= 'postgresql://unused@127.0.0.1:1/unused';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ClockStateSource)
      .useValue({ read: async () => ({ offsetSeconds: 0, lastResetAt: null }) })
      .overrideProvider(SportsRepository)
      .useValue({ search: async () => [] })
      .compile();
    app = configureApp(moduleRef.createNestApplication({ logger: false }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(['/health', '/clock', '/sports'])('%s открыт гостю', async (path) => {
    expect((await request(app.getHttpServer()).get(path)).status).toBe(200);
  });

  it('/me без входа — 401', async () => {
    const response = await request(app.getHttpServer()).get('/me');
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('unauthorized');
  });
});
