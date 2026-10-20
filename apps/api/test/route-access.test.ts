import 'reflect-metadata';
import { All, Controller, Get, Post, RequestMethod } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { MetadataScanner, ModulesContainer } from '@nestjs/core';
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
  // Без HTTP-метода Nest вешает обработчик на все методы, поэтому он изменяющий
  method: RequestMethod | undefined;
  handler: object;
  controller: object;
}

// Читающие методы; всё остальное, в том числе `@All()`, считается изменяющим
const READS = [RequestMethod.GET, RequestMethod.HEAD, RequestMethod.OPTIONS];

type ControllerClass = (new (...args: never[]) => object) & { name: string };

function collectControllers(modules: ModulesContainer): ControllerClass[] {
  const controllers: ControllerClass[] = [];
  for (const module of modules.values()) {
    for (const wrapper of module.controllers.values()) {
      if (wrapper.metatype) controllers.push(wrapper.metatype as ControllerClass);
    }
  }
  return controllers;
}

// Методы — как их находит Nest: по всей цепочке прототипов, с унаследованными
function collectRoutes(controllers: ControllerClass[]): Route[] {
  const scanner = new MetadataScanner();
  const routes: Route[] = [];
  for (const controller of controllers) {
    const prototype = controller.prototype as Record<string, unknown>;
    for (const key of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[key];
      if (typeof handler !== 'function') continue;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      if (path === undefined) continue;
      routes.push({ name: `${controller.name}.${key}`, method, handler, controller });
    }
  }
  return routes;
}

const unmarkedWrites = (routes: Route[]) =>
  routes
    .filter((route) => route.method === undefined || !READS.includes(route.method))
    .filter(
      (route) =>
        !Reflect.getMetadata(PUBLIC_KEY, route.handler) &&
        !Reflect.getMetadata(ROLES_KEY, route.handler),
    )
    .map((route) => route.name);

const publicControllers = (controllers: ControllerClass[]) =>
  controllers
    .filter((controller) => Reflect.getMetadata(PUBLIC_KEY, controller))
    .map((controller) => controller.name);

// Образцы того, что проверка обязана заметить: унаследованный POST, @All и путь
// без HTTP-метода — все без метки
class BaseWrites {
  @Post('reset')
  reset() {
    return undefined;
  }
}

@Controller('probe')
class InheritedWrites extends BaseWrites {
  @All('any')
  any() {
    return undefined;
  }

  @Get()
  read() {
    return undefined;
  }

  pathOnly() {
    return undefined;
  }
}
// Путь без HTTP-метода: Nest регистрирует такой обработчик через router.use — на все методы
Reflect.defineMetadata(PATH_METADATA, 'path-only', InheritedWrites.prototype.pathOnly);

@Controller('probe-public')
class PublicController {}
Reflect.defineMetadata(PUBLIC_KEY, true, PublicController);

describe('проверка меток видит то, что регистрирует Nest', () => {
  it('унаследованный изменяющий маршрут, @All и путь без HTTP-метода — без метки', () => {
    const routes = collectRoutes([InheritedWrites]);
    expect(routes.map((route) => route.name).sort()).toEqual([
      'InheritedWrites.any',
      'InheritedWrites.pathOnly',
      'InheritedWrites.read',
      'InheritedWrites.reset',
    ]);
    expect(unmarkedWrites(routes).sort()).toEqual([
      'InheritedWrites.any',
      'InheritedWrites.pathOnly',
      'InheritedWrites.reset',
    ]);
  });

  it('@Public на контроллере без единого своего маршрута', () => {
    expect(publicControllers([InheritedWrites, PublicController])).toEqual(['PublicController']);
  });
});

describe('метки доступа маршрутов приложения', () => {
  let controllers: ControllerClass[];
  let routes: Route[];
  let close: () => Promise<void>;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= 'postgresql://unused@127.0.0.1:1/unused';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    controllers = collectControllers(moduleRef.get(ModulesContainer));
    routes = collectRoutes(controllers);
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
        'AuthController.updateSettings',
        'ClockController.get',
        'EventsController.create',
        'EventsController.feed',
        'EventsController.card',
        'HealthController.check',
        'OrganizationsController.view',
        'OrganizationsController.update',
        'OrganizationsController.submit',
        'SportsController.search',
      ]),
    );
  });

  it('@Public не стоит ни на одном контроллере', () => {
    expect(publicControllers(controllers)).toEqual([]);
  });

  it('у каждого изменяющего маршрута метка доступа стоит на самом методе', () => {
    expect(unmarkedWrites(routes)).toEqual([]);
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
