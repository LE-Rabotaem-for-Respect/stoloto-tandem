import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { STAND_CONFIG } from '../src/core/config';
import { EventBus } from '../src/core/event-bus';
import type { ParticipationStatus } from '@tandem/domain';
import type { Prisma } from '../src/generated/prisma/client';
import { hashPassword } from '../src/modules/auth/password';
import { ParticipationsRepository } from '../src/modules/participations/participations.repository';
import { databaseUrl, participation, prisma } from './db';

const COOKIE = 'tandem_session';
const PASSWORD = 'пароль-1234';
const DAY = 86_400_000;
const inDays = (days: number, hours = 0) => new Date(Date.now() + days * DAY + hours * 3_600_000);

let app: INestApplication;
let passwordHash: string;
let sportId: string;
const http = () => request(app.getHttpServer());

async function account(role: 'user' | 'admin' | 'org') {
  const email = `${role}-${randomUUID()}@example.ru`;
  const user = await prisma.user.create({
    data: { name: `Аккаунт ${role}`, email, passwordHash, role, createdAt: new Date() },
  });
  if (role === 'org') {
    await prisma.organization.create({
      data: {
        ownerUserId: user.id,
        name: `Клуб ${randomUUID().slice(0, 6)}`,
        description: 'Описание',
        city: 'Красноярск',
        contacts: '+7 900 000-00-00',
        representativeName: 'Иван Петров',
        representativeRole: 'Тренер',
        status: 'approved',
      },
    });
  }
  const login = await http().post('/auth/login').send({ email, password: PASSWORD });
  if (login.status !== 200) throw new Error(`Вход не удался: ${login.status}`);
  const header = login.headers['set-cookie'] as unknown as string[];
  const cookie = header.find((line) => line.startsWith(`${COOKIE}=`))?.split(';')[0] ?? '';
  return { id: user.id, cookie };
}

type Account = Awaited<ReturnType<typeof account>>;

let organizer: Account;
let anna: Account;
let igor: Account;
let admin: Account;
let org: Account;

function createEvent(data: Partial<Prisma.EventUncheckedCreateInput> = {}) {
  const now = new Date();
  return prisma.event.create({
    data: {
      organizerUserId: organizer.id,
      sportId,
      title: 'Футбол в среду',
      description: 'Играем 7 на 7',
      startsAt: inDays(3),
      endsAt: inDays(3, 2),
      city: 'Красноярск',
      area: 'Центральный',
      placeText: 'Стадион',
      statusChangedAt: now,
      createdAt: now,
      ...data,
    },
  });
}

const join = (who: Account | null, eventId: string, body?: object) => {
  const req = http().post(`/events/${eventId}/join`);
  if (who) req.set('Cookie', who.cookie);
  return body ? req.send(body) : req;
};
const leave = (who: Account, eventId: string) =>
  http().post(`/events/${eventId}/leave`).set('Cookie', who.cookie);

const statuses = async (eventId: string, userId: string) =>
  (
    await prisma.participation.findMany({
      where: { eventId, userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { status: true },
    })
  ).map((row) => row.status);

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
      data: { name: `Бег ${tag}`, normalizedName: `бег ${tag}`, category: 'endurance' },
    })
  ).id;
  [organizer, anna, igor, admin, org] = await Promise.all([
    account('user'),
    account('user'),
    account('user'),
    account('admin'),
    account('org'),
  ]);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('POST /events/:id/join: свободная запись', () => {
  it('сразу участник; карточка показывает «Вы участник»; в шину — ParticipationConfirmed', async () => {
    const event = await createEvent();
    const published = vi.spyOn(app.get(EventBus), 'publish');
    const response = await join(anna, event.id);
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ eventId: event.id, status: 'confirmed' });
    expect(published).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ParticipationConfirmed',
        participationId: response.body.id,
        eventId: event.id,
        userId: anna.id,
        via: 'join',
        actorId: anna.id,
      }),
    );
    published.mockRestore();

    const card = await http().get(`/events/${event.id}`).set('Cookie', anna.cookie);
    expect(card.body.participation).toBe('confirmed');
  });

  it('ответ без вопроса организатора не принимается', async () => {
    const event = await createEvent();
    const response = await join(anna, event.id, { answer: 'Буду' });
    expect(response.status).toBe(400);
    expect(response.body.fields).toEqual({ answer: 'У мероприятия нет вопроса к заявке' });
    expect(await statuses(event.id, anna.id)).toEqual([]);
  });

  it('повторная запись — «Вы уже записаны»', async () => {
    const event = await createEvent();
    await join(anna, event.id);
    const again = await join(anna, event.id);
    expect(again.status).toBe(409);
    expect(again.body).toEqual({
      code: 'already_joined',
      message: 'Вы уже записаны на это мероприятие',
    });
    expect(await statuses(event.id, anna.id)).toEqual(['confirmed']);
  });
});

describe('POST /events/:id/join: по заявке', () => {
  it('с вопросом: без ответа — ошибка поля, с ответом — «Заявка на рассмотрении»', async () => {
    const event = await createEvent({ mode: 'approval', applyQuestion: 'Какой у вас уровень?' });
    const empty = await join(anna, event.id, { answer: '   ' });
    expect(empty.status).toBe(400);
    expect(empty.body.fields).toEqual({ answer: 'Ответьте на вопрос организатора' });

    const published = vi.spyOn(app.get(EventBus), 'publish');
    const response = await join(anna, event.id, { answer: ' Бегаю 10 км ' });
    expect(response.status).toBe(201);
    expect(response.body.status).toBe('pending');
    expect(published).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ParticipationRequested',
        eventId: event.id,
        userId: anna.id,
      }),
    );
    published.mockRestore();
    const stored = await prisma.participation.findUniqueOrThrow({
      where: { id: response.body.id },
    });
    expect(stored.answer).toBe('Бегаю 10 км');
  });

  it('без вопроса: заявка без ответа', async () => {
    const event = await createEvent({ mode: 'approval' });
    const response = await join(anna, event.id);
    expect(response.status).toBe(201);
    expect(response.body.status).toBe('pending');
  });

  it('ответ длиннее 1000 символов и с управляющими символами — ошибка поля', async () => {
    const event = await createEvent({ mode: 'approval', applyQuestion: 'Уровень?' });
    for (const answer of ['а'.repeat(1001), 'Новичок‮']) {
      const response = await join(anna, event.id, { answer });
      expect(response.status).toBe(400);
      expect(Object.keys(response.body.fields)).toEqual(['answer']);
    }
  });

  it('после отказа повторная заявка недоступна', async () => {
    const event = await createEvent({ mode: 'approval' });
    await participation(event.id, anna.id, 'rejected');
    const response = await join(anna, event.id);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('rejected_final');
    expect(await statuses(event.id, anna.id)).toEqual(['rejected']);
  });
});

describe('POST /events/:id/leave', () => {
  it.each(['confirmed', 'pending', 'waitlist'] as const)(
    '%s → «Вы отменили запись»; в шину — ParticipationCancelled',
    async (from) => {
      const event = await createEvent();
      const row = await participation(event.id, anna.id, from);
      const published = vi.spyOn(app.get(EventBus), 'publish');
      const response = await leave(anna, event.id);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ id: row.id, eventId: event.id, status: 'cancelled' });
      expect(published).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ParticipationCancelled',
          participationId: row.id,
          userId: anna.id,
          previousStatus: from,
        }),
      );
      published.mockRestore();
    },
  );

  it('после отмены записаться снова можно — новой записью', async () => {
    const event = await createEvent();
    await join(anna, event.id);
    await leave(anna, event.id);
    const again = await join(anna, event.id);
    expect(again.status).toBe(201);
    expect(again.body.status).toBe('confirmed');
    expect(await statuses(event.id, anna.id)).toEqual(['cancelled', 'confirmed']);
  });

  it('без записи и после отказа отменять нечего', async () => {
    const event = await createEvent();
    const none = await leave(anna, event.id);
    expect(none.status).toBe(409);
    expect(none.body.code).toBe('invalid_transition');

    await participation(event.id, igor.id, 'rejected');
    const rejected = await leave(igor, event.id);
    expect(rejected.status).toBe(409);
    expect(await statuses(event.id, igor.id)).toEqual(['rejected']);
  });

  it.each([
    ['снятого с публикации', { status: 'unpublished', statusReason: 'Проверка' }],
    ['удалённого', { status: 'deleted', statusReason: 'Проверка' }],
    ['отменённого', { status: 'cancelled', statusReason: 'Дождь' }],
    ['завершённого', { startsAt: inDays(-1), endsAt: inDays(-1, 2) }],
  ] as const)('у %s мероприятия запись не меняется (ТЗ 4.3, 2.10)', async (_, data) => {
    const event = await createEvent(data);
    await participation(event.id, anna.id, 'confirmed');
    const response = await leave(anna, event.id);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('event_not_joinable');
    expect(await statuses(event.id, anna.id)).toEqual(['confirmed']);
  });

  it('несуществующее и неверный id — «Мероприятие недоступно»', async () => {
    for (const id of [randomUUID(), 'not-a-uuid']) {
      const response = await leave(anna, id);
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('event_not_available');
    }
  });

  it('гостю — 401, организации и администратору — «только пользователи»', async () => {
    const event = await createEvent();
    expect((await http().post(`/events/${event.id}/leave`)).status).toBe(401);
    for (const who of [org, admin]) {
      const response = await leave(who, event.id);
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('users_only');
    }
  });
});

describe('кому и куда записаться нельзя', () => {
  it('гостю — 401', async () => {
    const event = await createEvent();
    const response = await join(null, event.id);
    expect(response.status).toBe(401);
  });

  it('на своё мероприятие, организации и администратору', async () => {
    const event = await createEvent();
    const own = await join(organizer, event.id);
    expect(own.status).toBe(403);
    expect(own.body.code).toBe('own_event');
    for (const who of [org, admin]) {
      const response = await join(who, event.id);
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('users_only');
    }
  });

  it.each([
    ['снятое с публикации', { status: 'unpublished', statusReason: 'Проверка' }],
    ['удалённое', { status: 'deleted', statusReason: 'Проверка' }],
    ['отменённое', { status: 'cancelled', statusReason: 'Дождь' }],
    ['завершённое', { startsAt: inDays(-1), endsAt: inDays(-1, 2) }],
  ] as const)('%s — «Мероприятие недоступно для записи» (409)', async (_, data) => {
    const event = await createEvent(data);
    const response = await join(anna, event.id);
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      code: 'event_not_joinable',
      message: 'Мероприятие недоступно для записи',
    });
    expect(await statuses(event.id, anna.id)).toEqual([]);
  });

  it('несуществующее и неверный id — «Мероприятие недоступно»', async () => {
    for (const id of [randomUUID(), 'not-a-uuid']) {
      const response = await join(anna, id);
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('event_not_available');
    }
  });
});

describe('лимит мест', () => {
  it('без мест свободная запись не проходит, заявка — проходит', async () => {
    const free = await createEvent({ capacity: 1 });
    await participation(free.id, igor.id, 'confirmed');
    const full = await join(anna, free.id);
    expect(full.status).toBe(409);
    expect(full.body.code).toBe('no_seats');
    expect(await statuses(free.id, anna.id)).toEqual([]);

    // Заявка мест не занимает: принять её без мест нельзя, а подать можно (ТЗ 2.4)
    const approval = await createEvent({ mode: 'approval', capacity: 1 });
    await participation(approval.id, igor.id, 'confirmed');
    const request = await join(anna, approval.id);
    expect(request.status).toBe(201);
    expect(request.body.status).toBe('pending');
  });

  it('заявки и отменённые места не занимают', async () => {
    const event = await createEvent({ capacity: 1 });
    await participation(event.id, igor.id, 'pending');
    await participation(event.id, admin.id, 'cancelled');
    const response = await join(anna, event.id);
    expect(response.status).toBe(201);
    expect(response.body.status).toBe('confirmed');
  });

  it('одновременные запросы на последнее место не превышают лимит', async () => {
    const event = await createEvent({ capacity: 1 });
    const racers = [anna, igor, ...(await Promise.all([1, 2, 3].map(() => account('user'))))];

    // Барьер: посчитав места, запрос ждёт остальных до 500 мс. Без блокировки строки события
    // все насчитают ноль и запишутся; с ней следующий дойдёт до подсчёта только после
    // фиксации предыдущего — так пересечение не зависит от того, как придут запросы
    const repository = app.get(ParticipationsRepository);
    const count = repository.confirmedCount.bind(repository);
    let arrived = 0;
    let releaseAll: () => void = () => undefined;
    const allArrived = new Promise<void>((resolve) => (releaseAll = resolve));
    const spy = vi.spyOn(repository, 'confirmedCount').mockImplementation(async (...args) => {
      const result = await count(...args);
      arrived += 1;
      if (arrived === racers.length) releaseAll();
      await Promise.race([allArrived, new Promise((resolve) => setTimeout(resolve, 500))]);
      return result;
    });
    const responses = await Promise.all(racers.map((who) => join(who, event.id)));
    spy.mockRestore();

    const codes = responses.map((response) => response.status).sort();
    expect(codes).toEqual([201, 409, 409, 409, 409]);
    for (const response of responses.filter((r) => r.status === 409)) {
      expect(response.body.code).toBe('no_seats');
    }
    const confirmed = await prisma.participation.count({
      where: { eventId: event.id, status: 'confirmed' },
    });
    expect(confirmed).toBe(1);
  });

  it('два одновременных запроса одного человека дают одну запись', async () => {
    const event = await createEvent();
    const responses = await Promise.all([join(anna, event.id), join(anna, event.id)]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await statuses(event.id, anna.id)).toEqual(['confirmed']);
  });
});

describe('GET /me/participations: «Мои записи»', () => {
  const mine = (who: Account) => http().get('/me/participations').set('Cookie', who.cookie);
  const record = (eventId: string, userId: string, status: ParticipationStatus, extra = {}) =>
    prisma.participation.create({
      data: { eventId, userId, status, createdAt: new Date(), updatedAt: new Date(), ...extra },
    });

  it('гостю — 401', async () => {
    expect((await http().get('/me/participations')).status).toBe(401);
  });

  it('группы, статусы и порядок: по записи на мероприятие, чужих записей нет', async () => {
    const me = await account('user');
    const soon = await createEvent({ title: 'Скоро', startsAt: inDays(1), endsAt: inDays(1, 2) });
    const later = await createEvent({ title: 'Позже', startsAt: inDays(5), endsAt: inDays(5, 2) });
    const request = await createEvent({ title: 'Заявка', mode: 'approval' });
    const finished = await createEvent({
      title: 'Было',
      startsAt: inDays(-3),
      endsAt: inDays(-3, 2),
    });
    const older = await createEvent({
      title: 'Давно',
      startsAt: inDays(-9),
      endsAt: inDays(-9, 2),
    });
    const called = await createEvent({
      title: 'Отменено',
      status: 'cancelled',
      statusReason: 'Дождь',
    });
    const rejected = await createEvent({ title: 'Отказ', mode: 'approval' });
    const rejoined = await createEvent({
      title: 'Снова',
      startsAt: inDays(2),
      endsAt: inDays(2, 2),
    });

    await record(later.id, me.id, 'confirmed');
    await record(soon.id, me.id, 'confirmed');
    await record(request.id, me.id, 'pending');
    await record(finished.id, me.id, 'confirmed');
    await record(older.id, me.id, 'confirmed');
    await record(called.id, me.id, 'confirmed');
    await record(rejected.id, me.id, 'rejected', { decisionReason: 'Группа набрана' });
    await record(rejoined.id, me.id, 'cancelled');
    await record(rejoined.id, me.id, 'confirmed');
    await record(soon.id, igor.id, 'confirmed');

    const response = await mine(me);
    expect(response.status).toBe(200);
    const items = response.body.items as {
      status: string;
      group: string;
      decisionReason: string | null;
      event: { title: string; displayStatus: string };
    }[];
    expect(items.map((item) => [item.group, item.event.title, item.status])).toEqual([
      ['upcoming', 'Скоро', 'confirmed'],
      ['upcoming', 'Снова', 'confirmed'],
      ['upcoming', 'Отказ', 'rejected'],
      ['upcoming', 'Позже', 'confirmed'],
      ['pending', 'Заявка', 'pending'],
      ['past', 'Отменено', 'confirmed'],
      ['past', 'Было', 'confirmed'],
      ['past', 'Давно', 'confirmed'],
    ]);
    expect(items.find((item) => item.status === 'rejected')?.decisionReason).toBe('Группа набрана');
    expect(items.find((item) => item.event.title === 'Отменено')?.event.displayStatus).toBe(
      'cancelled',
    );
    expect(items.find((item) => item.event.title === 'Было')?.event.displayStatus).toBe('finished');
  });

  it('строка — карточка ленты: направление, организатор, время; лишних полей нет', async () => {
    const me = await account('user');
    const event = await createEvent();
    const row = await record(event.id, me.id, 'confirmed');
    const response = await mine(me);
    expect(response.body.items).toEqual([
      {
        id: row.id,
        status: 'confirmed',
        decisionReason: null,
        waitlistPosition: null,
        group: 'upcoming',
        event: {
          id: event.id,
          title: 'Футбол в среду',
          sport: expect.objectContaining({ id: sportId, category: 'endurance' }),
          organizer: { kind: 'user', id: organizer.id, name: 'Аккаунт user' },
          startsAt: event.startsAt.toISOString(),
          endsAt: event.endsAt.toISOString(),
          city: 'Красноярск',
          area: 'Центральный',
          mode: 'free',
          level: 'any',
          displayStatus: 'open',
        },
      },
    ]);
  });

  it('отменённая запись видна, пока нет новой', async () => {
    const me = await account('user');
    const event = await createEvent();
    await record(event.id, me.id, 'cancelled');
    const response = await mine(me);
    expect(response.body.items.map((item: { status: string }) => item.status)).toEqual([
      'cancelled',
    ]);
  });

  it('лист ожидания — с позицией в очереди', async () => {
    const me = await account('user');
    const event = await createEvent({ capacity: 1 });
    const at = (minutes: number) => {
      const time = new Date(Date.now() - 60 * 60_000 + minutes * 60_000);
      return { createdAt: time, updatedAt: time };
    };
    await record(event.id, anna.id, 'confirmed', at(0));
    await record(event.id, igor.id, 'waitlist', at(1));
    await record(event.id, me.id, 'waitlist', at(2));
    const response = await mine(me);
    expect(response.body.items).toMatchObject([
      { status: 'waitlist', waitlistPosition: 2, event: { displayStatus: 'full' } },
    ]);
  });

  it('снятое модератором: видно записанному, после отказа — нет', async () => {
    const me = await account('user');
    const hidden = { status: 'unpublished' as const, statusReason: 'Проверка' };
    const signed = await createEvent({ ...hidden, title: 'Записан' });
    const refused = await createEvent({ ...hidden, title: 'Отказали', mode: 'approval' });
    await record(signed.id, me.id, 'confirmed');
    await record(refused.id, me.id, 'rejected');
    const response = await mine(me);
    expect(
      response.body.items.map((item: { event: { title: string; displayStatus: string } }) => [
        item.event.title,
        item.event.displayStatus,
      ]),
    ).toEqual([['Записан', 'unpublished']]);
  });

  it('у организации и администратора записей нет — пустой список', async () => {
    for (const who of [org, admin]) {
      const response = await mine(who);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ items: [] });
    }
  });
});
