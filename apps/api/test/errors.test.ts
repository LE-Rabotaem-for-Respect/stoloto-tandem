import 'reflect-metadata';
import { Body, Controller, Get, Logger, Module, Param, Post } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ERROR_CODES,
  ERROR_HTTP_STATUS,
  ERROR_MESSAGES,
  participationMachine,
} from '@tandem/domain';
import type { ErrorCode } from '@tandem/domain';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { configureApp } from '../src/configure-app';
import { ClockModule, ClockStateSource, REAL_TIME } from '../src/core/clock';
import { STAND_CONFIG } from '../src/core/config';
import { ApiError } from '../src/core/errors';
import { canJoin } from '../src/core/policies';
import { Prisma } from '../src/generated/prisma/client';

const serverTime = '2026-10-19T05:00:00.000Z';

class CreateThingDto {
  @IsString({ message: 'Укажите название' })
  @IsNotEmpty({ message: 'Укажите название' })
  title!: string;

  @IsInt({ message: 'Лимит — целое число' })
  @Min(1, { message: 'Лимит — от 1' })
  limit!: number;
}

// Так выглядит meta нарушения уникальности у Prisma 7 с @prisma/adapter-pg
const adapterUniqueMeta = (index: string, modelName: string) => ({
  driverAdapterError: {
    cause: { originalCode: '23505', kind: 'UniqueConstraintViolation', constraint: { index } },
  },
  modelName,
});

const prismaError = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('Ошибка базы', { code, clientVersion: 'test', meta });

@Controller('probe')
class ProbeController {
  @Get('api-error')
  apiError() {
    throw new ApiError('event_not_joinable');
  }

  @Get('code/:code')
  code(@Param('code') code: ErrorCode) {
    throw new ApiError(code);
  }

  // Так сервис записи откажет по политике: мероприятие снято модератором (сценарий 6)
  @Get('join-unpublished')
  joinUnpublished() {
    const decision = canJoin(
      { role: 'user', userId: 'u-anna' },
      {
        status: 'unpublished',
        startsAt: new Date('2026-10-24T05:00:00Z'),
        endsAt: new Date('2026-10-24T08:00:00Z'),
        organizerUserId: null,
        organizerOrgId: 'o-ladya',
      },
      new Date(serverTime),
    );
    if (!decision.allowed) throw new ApiError(decision.code);
  }

  @Get('api-error-fields')
  apiErrorFields() {
    throw new ApiError('validation_failed', { startsAt: 'Время начала — в будущем' });
  }

  @Get('transition')
  transition() {
    participationMachine.nextState('rejected', 'join', { mode: 'free', hasSeats: true });
  }

  @Post('dto')
  dto(@Body() body: CreateThingDto) {
    return { ok: true, limit: body.limit };
  }

  @Get('unique')
  unique() {
    throw prismaError('P2002', adapterUniqueMeta('users_email_key', 'User'));
  }

  @Get('unique-internal')
  uniqueInternal() {
    throw prismaError('P2002', adapterUniqueMeta('sessions_token_hash_key', 'Session'));
  }

  @Get('prisma-crash')
  prismaCrash() {
    throw new Prisma.PrismaClientValidationError(
      'Invalid prisma.user.create() invocation: data: { email: "anna@demo", passwordHash: "секрет" }',
      { clientVersion: 'test' },
    );
  }

  @Get('timeout')
  timeout() {
    throw prismaError('P2028');
  }

  @Get('crash')
  crash() {
    throw new Error('секретная подробность: строка подключения');
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe('core/errors: единый формат ошибок { code, message, fields? }', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ProbeModule, ClockModule] })
      .overrideProvider(STAND_CONFIG)
      .useValue({ demoMode: false, standId: null })
      .overrideProvider(ClockStateSource)
      .useValue({ read: async () => ({ offsetSeconds: 0, lastResetAt: null }) })
      .overrideProvider(REAL_TIME)
      .useValue(() => Date.parse(serverTime))
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('ApiError: HTTP-код по коду ошибки и текст из словаря', async () => {
    const response = await http().get('/probe/api-error');
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      code: 'event_not_joinable',
      message: 'Мероприятие недоступно для записи',
    });
  });

  it('ApiError с полями отдаёт fields', async () => {
    const response = await http().get('/probe/api-error-fields');
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      code: 'validation_failed',
      message: 'Проверьте поля формы',
      fields: { startsAt: 'Время начала — в будущем' },
    });
  });

  it('отказ автомата: код и точный текст автомата, 409', async () => {
    const response = await http().get('/probe/transition');
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('rejected_final');
    expect(response.body.message).toMatch(/[А-Яа-я]/);
  });

  it('DTO: тексты полей из декораторов', async () => {
    const response = await http().post('/probe/dto').send({ title: '', limit: 0 });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      code: 'validation_failed',
      message: 'Проверьте поля формы',
      fields: { title: 'Укажите название', limit: 'Лимит — от 1' },
    });
  });

  it('DTO: лишнее поле отклоняется (forbidNonWhitelisted)', async () => {
    const response = await http()
      .post('/probe/dto')
      .send({ title: 'Футбол', limit: 10, status: 'approved' });
    expect(response.status).toBe(400);
    expect(response.body.fields).toEqual({ status: 'Лишнее поле' });
  });

  it('DTO: корректное тело проходит и приводится к типам', async () => {
    const response = await http().post('/probe/dto').send({ title: 'Футбол', limit: 10 });
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ ok: true, limit: 10 });
  });

  it('битый JSON — validation_failed', async () => {
    const response = await http()
      .post('/probe/dto')
      .set('Content-Type', 'application/json')
      .send('{"title":');
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('validation_failed');
    expect(response.headers['x-server-time']).toBe(serverTime);
  });

  it('слишком большое тело — too_large, а не непредвиденная ошибка', async () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const response = await http()
      .post('/probe/dto')
      .send({ title: 'x'.repeat(200_000), limit: 1 });
    expect(logged).not.toHaveBeenCalled();
    logged.mockRestore();
    expect(response.status).toBe(413);
    expect(response.body).toEqual({ code: 'too_large', message: 'Слишком большой запрос' });
    expect(response.headers['x-server-time']).toBe(serverTime);
  });

  it('нарушение уникальности в базе (P2002) — conflict с полем', async () => {
    const response = await http().get('/probe/unique');
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      code: 'conflict',
      message: 'Такая запись уже есть',
      fields: { email: 'Эта почта уже зарегистрирована' },
    });
  });

  it('служебная уникальность (P2002 без поля формы) — conflict без fields', async () => {
    const response = await http().get('/probe/unique-internal');
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ code: 'conflict', message: 'Такая запись уже есть' });
  });

  it('ошибка Prisma в журнале — без аргументов вызова', async () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const response = await http().get('/probe/prisma-crash');
    const written = JSON.stringify(logged.mock.calls);
    logged.mockRestore();
    expect(response.status).toBe(500);
    expect(written).toContain('PrismaClientValidationError');
    expect(written).not.toContain('anna@demo');
    expect(written).not.toContain('секрет');
  });

  it('тайм-аут транзакции (P2028) — busy', async () => {
    const response = await http().get('/probe/timeout');
    expect(response.status).toBe(503);
    expect(response.body.code).toBe('busy');
  });

  it('неизвестный маршрут — not_found', async () => {
    const response = await http().get('/nope');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ code: 'not_found', message: 'Не найдено' });
  });

  it('непредвиденная ошибка — internal без подробностей', async () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const response = await http().get('/probe/crash');
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      code: 'internal',
      message: 'Что-то пошло не так. Попробуйте ещё раз',
    });
    expect(JSON.stringify(response.body)).not.toContain('секретная');
    expect(response.headers['x-server-time']).toBe(serverTime);
  });
});

describe('core/errors: HTTP-статус каждой ошибки из таблицы @tandem/domain', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ProbeModule, ClockModule] })
      .overrideProvider(STAND_CONFIG)
      .useValue({ demoMode: false, standId: null })
      .overrideProvider(ClockStateSource)
      .useValue({ read: async () => ({ offsetSeconds: 0, lastResetAt: null }) })
      .overrideProvider(REAL_TIME)
      .useValue(() => Date.parse(serverTime))
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(ERROR_CODES)('%s — свой статус и формат { code, message }', async (code) => {
    const response = await http().get(`/probe/code/${code}`);
    expect(response.status).toBe(ERROR_HTTP_STATUS[code]);
    expect(response.body).toEqual({ code, message: ERROR_MESSAGES[code] });
  });

  it('запись на снятое с публикации мероприятие — 409 «Мероприятие недоступно для записи»', async () => {
    const response = await http().get('/probe/join-unpublished');
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      code: 'event_not_joinable',
      message: 'Мероприятие недоступно для записи',
    });
  });
});
