import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PUBLIC_KEY, ROLES_KEY } from '../src/core/access';

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

  it('маршруты найдены', () => {
    expect(routes.map((route) => route.name)).toEqual(
      expect.arrayContaining(['AuthController.login', 'HealthController.check']),
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
