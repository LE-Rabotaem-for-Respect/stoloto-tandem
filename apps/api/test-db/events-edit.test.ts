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
import type { ParticipationStatus } from '../src/generated/prisma/client';
import { databaseUrl, prisma } from './db';

const COOKIE = 'tandem_session';
const PASSWORD = 'пароль-1234';
const HOUR = 3_600_000;
const inHours = (hours: number) => new Date(Date.now() + hours * HOUR);

let app: INestApplication;
let passwordHash: string;
let sportId: string;
const http = () => request(app.getHttpServer());

async function account(role: 'user' | 'admin') {
  const email = `${role}-${randomUUID()}@example.ru`;
  const user = await prisma.user.create({
    data: { name: `Аккаунт ${role}`, email, passwordHash, role, createdAt: new Date() },
  });
  const login = await http().post('/auth/login').send({ email, password: PASSWORD });
  if (login.status !== 200) throw new Error(`Вход не удался: ${login.status}`);
  const header = login.headers['set-cookie'] as unknown as string[];
  const cookie = header.find((line) => line.startsWith(`${COOKIE}=`))?.split(';')[0] ?? '';
  return { id: user.id, cookie };
}
type Account = Awaited<ReturnType<typeof account>>;

let igor: Account;
let anna: Account;
let admin: Account;

/** Мероприятие Игоря прямо в базе: так можно задать и прошедшее начало, и любой статус. */
async function event(
  patch: Partial<{
    startsAt: Date;
    status: 'published' | 'cancelled' | 'unpublished' | 'deleted';
    mode: 'free' | 'approval';
    applyQuestion: string | null;
    capacity: number | null;
  }> = {},
) {
  const startsAt = patch.startsAt ?? inHours(48);
  const created = await prisma.event.create({
    data: {
      sportId,
      organizerUserId: igor.id,
      title: 'Футбол 7×7 по средам',
      description: 'Играем 7 на 7',
      startsAt,
      endsAt: new Date(startsAt.getTime() + 2 * HOUR),
      city: 'Красноярск',
      area: 'Центральный',
      placeText: 'Поле у школы',
      participantInfo: 'Раздевалка с 18:30',
      level: 'amateur',
      mode: patch.mode ?? 'free',
      applyQuestion: patch.applyQuestion ?? null,
      capacity: patch.capacity ?? null,
      status: patch.status ?? 'published',
      statusChangedAt: new Date(),
      createdAt: new Date(),
    },
  });
  return created.id;
}

/** Записи разных людей на мероприятие — по одной на человека. */
async function participations(eventId: string, ...statuses: ParticipationStatus[]) {
  for (const status of statuses) {
    const user = await prisma.user.create({
      data: {
        name: 'Участник',
        email: `p-${randomUUID()}@example.ru`,
        passwordHash,
        createdAt: new Date(),
      },
    });
    await prisma.participation.create({
      data: { eventId, userId: user.id, status, createdAt: new Date(), updatedAt: new Date() },
    });
  }
}

const patch = (who: Account | null, id: string, body: object) => {
  const req = http().patch(`/events/${id}`).send(body);
  return who ? req.set('Cookie', who.cookie) : req;
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
  const tag = randomUUID().slice(0, 8);
  sportId = (
    await prisma.sport.create({
      data: { name: `Футбол ${tag}`, normalizedName: `футбол ${tag}`, category: 'team' },
    })
  ).id;
  [igor, anna, admin] = await Promise.all([account('user'), account('user'), account('admin')]);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('PATCH /events/:id — что меняется свободно', () => {
  it('название, описание, «Информация для участников», уровень и место', async () => {
    const id = await event();
    const response = await patch(igor, id, {
      title: '  Футбол 8×8 по четвергам ',
      description: 'Играем 8 на 8',
      participantInfo: 'Раздевалка с 18:00',
      level: 'beginner',
      city: 'Дивногорск',
      area: 'Набережная',
      placeText: 'Стадион «Енисей»',
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id,
      title: 'Футбол 8×8 по четвергам',
      description: 'Играем 8 на 8',
      participantInfo: 'Раздевалка с 18:00',
      level: 'beginner',
      city: 'Дивногорск',
      area: 'Набережная',
      placeText: 'Стадион «Енисей»',
    });
    const stored = await prisma.event.findUniqueOrThrow({ where: { id } });
    expect(stored.title).toBe('Футбол 8×8 по четвергам');
    expect(stored.mode).toBe('free');
  });

  it('пустое тело ничего не меняет', async () => {
    const id = await event();
    const response = await patch(igor, id, {});
    expect(response.status).toBe(200);
    expect(response.body.title).toBe('Футбол 7×7 по средам');
  });

  it('у организатора в карточке есть «Изменить»', async () => {
    const id = await event();
    const card = await http().get(`/events/${id}`).set('Cookie', igor.cookie);
    expect(card.body.actions).toEqual(
      expect.arrayContaining([{ code: 'edit_event', enabled: true }]),
    );
  });
});

describe('PATCH /events/:id — что не меняется', () => {
  it.each([
    [
      'дата начала',
      { startsAt: inHours(72).toISOString() },
      'startsAt',
      'Дату и время меняют через «Перенести»',
    ],
    [
      'время окончания',
      { endsAt: inHours(73).toISOString() },
      'endsAt',
      'Дату и время меняют через «Перенести»',
    ],
    [
      'направление',
      { sportId: randomUUID() },
      'sportId',
      'Направление после публикации не меняется',
    ],
    [
      'новое направление',
      { newSport: { name: 'Падел' } },
      'newSport',
      'Направление после публикации не меняется',
    ],
    ['лишнее поле', { organizerUserId: randomUUID() }, 'organizerUserId', 'Лишнее поле'],
    ['короткое название', { title: 'Бег' }, 'title', 'Название — от 5 до 80 символов'],
  ])('%s — 400 с понятной причиной у поля', async (_, body, field, message) => {
    const id = await event();
    const response = await patch(igor, id, body);
    expect(response.status).toBe(400);
    expect(response.body.fields).toEqual({ [field]: message });
  });

  it('название null — отказ, а не «не менять»', async () => {
    const id = await event();
    const response = await patch(igor, id, { title: null });
    expect(response.status).toBe(400);
    expect(response.body.fields).toHaveProperty('title');
  });

  it.each(['pending', 'confirmed', 'waitlist'] as const)(
    'режим записи — нельзя, если есть запись в статусе %s',
    async (status) => {
      const id = await event();
      await participations(id, 'rejected', status);
      const response = await patch(igor, id, { mode: 'approval' });
      expect(response.status).toBe(400);
      expect(response.body.fields).toEqual({
        mode: 'Режим записи не меняется, пока есть заявки, участники или лист ожидания',
      });
      expect((await prisma.event.findUniqueOrThrow({ where: { id } })).mode).toBe('free');
    },
  );

  it('режим записи — можно, если записи только отклонённые и отменённые', async () => {
    const id = await event();
    await participations(id, 'rejected', 'cancelled');
    const response = await patch(igor, id, { mode: 'approval', applyQuestion: 'Ваш опыт?' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ mode: 'approval', applyQuestion: 'Ваш опыт?' });
  });

  it('тот же режим при записях — не изменение, проходит', async () => {
    const id = await event();
    await participations(id, 'confirmed');
    expect((await patch(igor, id, { mode: 'free', title: 'Футбол по пятницам' })).status).toBe(200);
  });

  it('«По заявке» → «Свободно» убирает вопрос к заявке; вопрос в свободном режиме — 400', async () => {
    const id = await event({ mode: 'approval', applyQuestion: 'Ваш опыт?' });
    const freed = await patch(igor, id, { mode: 'free' });
    expect(freed.status).toBe(200);
    expect(freed.body).toMatchObject({ mode: 'free', applyQuestion: null });

    const question = await patch(igor, id, { applyQuestion: 'Сколько играете?' });
    expect(question.status).toBe(400);
    expect(question.body.fields).toEqual({
      applyQuestion: 'Вопрос к заявке — только для режима «По заявке»',
    });
  });

  it('лимит мест — не ниже числа подтверждённых; null — без лимита', async () => {
    const id = await event({ capacity: 10 });
    await participations(id, 'confirmed', 'confirmed', 'pending', 'waitlist');

    const low = await patch(igor, id, { capacity: 1 });
    expect(low.status).toBe(400);
    expect(low.body.fields).toEqual({
      capacity: 'Лимит мест — не ниже числа подтверждённых участников: 2',
    });

    expect((await patch(igor, id, { capacity: 2 })).status).toBe(200);
    expect((await prisma.event.findUniqueOrThrow({ where: { id } })).capacity).toBe(2);
    expect((await patch(igor, id, { capacity: null })).status).toBe(200);
    expect((await prisma.event.findUniqueOrThrow({ where: { id } })).capacity).toBeNull();
    expect((await patch(igor, id, { capacity: 0 })).body.fields).toEqual({
      capacity: 'Лимит мест — от 1 до 1000',
    });
  });

  it('после начала изменить нельзя — и в карточке «Изменить» с причиной', async () => {
    const id = await event({ startsAt: inHours(-1) });
    const response = await patch(igor, id, { title: 'Футбол по пятницам' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('event_started');

    const card = await http().get(`/events/${id}`).set('Cookie', igor.cookie);
    expect(card.body.actions).toEqual(
      expect.arrayContaining([
        {
          code: 'edit_event',
          enabled: false,
          reason: 'Мероприятие уже началось: изменить его нельзя',
        },
      ]),
    );
  });

  it.each(['cancelled', 'unpublished'] as const)(
    'мероприятие в статусе %s изменить нельзя',
    async (status) => {
      const id = await event({ status });
      const response = await patch(igor, id, { title: 'Футбол по пятницам' });
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        code: 'invalid_transition',
        message: 'Изменить можно только опубликованное мероприятие',
      });
      expect((await prisma.event.findUniqueOrThrow({ where: { id } })).title).toBe(
        'Футбол 7×7 по средам',
      );
    },
  );
});

describe('PATCH /events/:id — кто меняет', () => {
  it('другой пользователь — 403, администратор — 403, гость — 401', async () => {
    const id = await event();
    const body = { title: 'Чужое название' };
    expect((await patch(anna, id, body)).body.code).toBe('not_event_organizer');
    expect((await patch(admin, id, body)).status).toBe(403);
    expect((await patch(null, id, body)).status).toBe(401);
    expect((await prisma.event.findUniqueOrThrow({ where: { id } })).title).toBe(
      'Футбол 7×7 по средам',
    );
  });

  it('несуществующее и неверный адрес — «Мероприятие недоступно»', async () => {
    for (const id of [randomUUID(), 'не-uuid']) {
      const response = await patch(igor, id, { title: 'Футбол по пятницам' });
      expect(response.status, id).toBe(404);
      expect(response.body.code, id).toBe('event_not_available');
    }
  });

  it('удалённое: организатору — нельзя изменить, остальным — недоступно', async () => {
    const id = await event({ status: 'deleted' });
    const own = await patch(igor, id, { title: 'Футбол по пятницам' });
    expect(own.status).toBe(409);
    expect(own.body.code).toBe('invalid_transition');
    const other = await patch(anna, id, { title: 'Футбол по пятницам' });
    expect(other.status).toBe(404);
    expect(other.body.code).toBe('event_not_available');
  });
});

describe('PATCH /events/:id — одновременно с записью', () => {
  it('смена режима ждёт запись, которая идёт в это же время, и видит её', async () => {
    const id = await event();
    const user = await prisma.user.create({
      data: {
        name: 'Участник',
        email: `p-${randomUUID()}@example.ru`,
        passwordHash,
        createdAt: new Date(),
      },
    });
    // «Запись» держит строку мероприятия, как сервис участия, и сохраняет заявку. Без
    // блокировки изменение насчитало бы ноль записей и сменило режим при живой заявке
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked: () => void = () => undefined;
    const lockTaken = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const join = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "events" WHERE "id" = ${id}::uuid FOR UPDATE`;
        locked();
        await held;
        await tx.participation.create({
          data: {
            eventId: id,
            userId: user.id,
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
      },
      { timeout: 10_000 },
    );
    await lockTaken;
    const editing = patch(igor, id, { mode: 'approval' }).then((response) => response);
    await new Promise((resolve) => setTimeout(resolve, 300));
    release();
    await join;

    const response = await editing;
    expect(response.status).toBe(400);
    expect(response.body.fields).toHaveProperty('mode');
    expect((await prisma.event.findUniqueOrThrow({ where: { id } })).mode).toBe('free');
  });
});
