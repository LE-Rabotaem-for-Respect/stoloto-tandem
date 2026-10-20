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
import type { Prisma } from '../src/generated/prisma/client';
import { hashPassword } from '../src/modules/auth/password';
import { ParticipationsRepository } from '../src/modules/participations/participations.repository';
import { databaseUrl, prisma } from './db';

const COOKIE = 'tandem_session';
const PASSWORD = 'пароль-1234';
const DAY = 86_400_000;
const inDays = (days: number, hours = 0) => new Date(Date.now() + days * DAY + hours * 3_600_000);
const NO_SEATS = 'Мест нет: увеличьте лимит или дождитесь отмены';

let app: INestApplication;
let passwordHash: string;
let sportId: string;
const http = () => request(app.getHttpServer());

async function account(role: 'user' | 'admin' | 'org', name = `Аккаунт ${role}`) {
  const email = `${role}-${randomUUID()}@example.ru`;
  const user = await prisma.user.create({
    data: { name, email, passwordHash, role, createdAt: new Date() },
  });
  let organizationId: string | null = null;
  if (role === 'org') {
    organizationId = (
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
      })
    ).id;
  }
  const login = await http().post('/auth/login').send({ email, password: PASSWORD });
  if (login.status !== 200) throw new Error(`Вход не удался: ${login.status}`);
  const header = login.headers['set-cookie'] as unknown as string[];
  const cookie = header.find((line) => line.startsWith(`${COOKIE}=`))?.split(';')[0] ?? '';
  return { id: user.id, cookie, organizationId };
}

type Account = Awaited<ReturnType<typeof account>>;

let organizer: Account;
let anna: Account;
let ksenia: Account;
let artem: Account;
let admin: Account;
let org: Account;

function createEvent(data: Partial<Prisma.EventUncheckedCreateInput> = {}) {
  const now = new Date();
  return prisma.event.create({
    data: {
      organizerUserId: organizer.id,
      sportId,
      title: 'Скалолазание для начинающих',
      description: 'Скалодром',
      startsAt: inDays(3),
      endsAt: inDays(3, 2),
      city: 'Красноярск',
      area: 'Центральный',
      placeText: 'Скалодром',
      mode: 'approval',
      applyQuestion: 'Ваш опыт?',
      statusChangedAt: now,
      createdAt: now,
      ...data,
    },
  });
}

const apply = async (who: Account, eventId: string, answer = 'Был один раз') => {
  const response = await http()
    .post(`/events/${eventId}/join`)
    .set('Cookie', who.cookie)
    .send({ answer });
  if (response.status !== 201) throw new Error(`Заявка не подана: ${response.status}`);
  return response.body.id as string;
};

const participants = (who: Account | null, eventId: string) => {
  const req = http().get(`/events/${eventId}/participants`);
  return who ? req.set('Cookie', who.cookie) : req;
};
const accept = (who: Account | null, id: string) => {
  const req = http().post(`/participations/${id}/accept`);
  return who ? req.set('Cookie', who.cookie) : req;
};
const reject = (who: Account, id: string, body?: object) => {
  const req = http().post(`/participations/${id}/reject`).set('Cookie', who.cookie);
  return body ? req.send(body) : req;
};

const statusOf = async (id: string) =>
  (await prisma.participation.findUniqueOrThrow({ where: { id }, select: { status: true } }))
    .status;

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
      data: {
        name: `Скалолазание ${tag}`,
        normalizedName: `скалолазание ${tag}`,
        category: 'other',
      },
    })
  ).id;
  [organizer, anna, ksenia, artem, admin, org] = await Promise.all([
    account('user', 'Игорь'),
    account('user', 'Анна'),
    account('user', 'Ксения'),
    account('user', 'Артём'),
    account('admin'),
    account('org'),
  ]);
}, 60_000);

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('GET /events/:id/participants', () => {
  it('организатору — «Ждут решения» с ответами, участники и архив; у заявок — принять и отклонить', async () => {
    const event = await createEvent({ capacity: 8 });
    const annaId = await apply(anna, event.id, 'Был один раз на скалодроме');
    const kseniaId = await apply(ksenia, event.id);
    const artemId = await apply(artem, event.id);
    await accept(organizer, artemId);
    await reject(organizer, kseniaId, { reason: 'Детская группа — по субботам' });

    const response = await participants(organizer, event.id);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ eventId: event.id, capacity: 8, confirmedCount: 1 });
    expect(response.body.pending).toEqual([
      expect.objectContaining({
        id: annaId,
        status: 'pending',
        user: { id: anna.id, name: 'Анна' },
        answer: 'Был один раз на скалодроме',
        actions: [
          { code: 'accept_participation', enabled: true },
          { code: 'reject_participation', enabled: true },
        ],
      }),
    ]);
    expect(response.body.confirmed).toEqual([
      expect.objectContaining({ id: artemId, user: { id: artem.id, name: 'Артём' }, actions: [] }),
    ]);
    expect(response.body.waitlist).toEqual([]);
    expect(response.body.archive).toEqual([
      expect.objectContaining({
        id: kseniaId,
        status: 'rejected',
        decisionReason: 'Детская группа — по субботам',
      }),
    ]);
    // Почта участников организатору не нужна
    expect(JSON.stringify(response.body)).not.toContain('@example.ru');
  });

  it('отменённые записи — в архиве', async () => {
    const event = await createEvent({ mode: 'free', applyQuestion: null });
    const joined = await http().post(`/events/${event.id}/join`).set('Cookie', anna.cookie);
    await http().post(`/events/${event.id}/leave`).set('Cookie', anna.cookie);
    const response = await participants(organizer, event.id);
    expect(response.body.archive).toEqual([
      expect.objectContaining({ id: joined.body.id, status: 'cancelled' }),
    ]);
    expect(response.body.confirmed).toEqual([]);
  });

  it('лимит исчерпан — «Принять» неактивно с подсказкой, «Отклонить» доступно', async () => {
    const event = await createEvent({ capacity: 1 });
    const first = await apply(anna, event.id);
    await apply(ksenia, event.id);
    await accept(organizer, first);
    const response = await participants(organizer, event.id);
    expect(response.body.pending[0].actions).toEqual([
      { code: 'accept_participation', enabled: false, reason: NO_SEATS },
      { code: 'reject_participation', enabled: true },
    ]);
  });

  it('администратору — просмотр без действий принять и отклонить', async () => {
    const event = await createEvent();
    await apply(anna, event.id);
    const response = await participants(admin, event.id);
    expect(response.status).toBe(200);
    expect(response.body.pending).toHaveLength(1);
    expect(response.body.pending[0].actions).toEqual([]);
  });

  it('участнику, другой организации и гостю — нельзя', async () => {
    const event = await createEvent();
    await apply(anna, event.id);
    expect((await participants(anna, event.id)).status).toBe(403);
    expect((await participants(org, event.id)).body.code).toBe('not_event_organizer');
    expect((await participants(null, event.id)).status).toBe(401);
  });

  it('организации-организатору — можно', async () => {
    const event = await createEvent({ organizerUserId: null, organizerOrgId: org.organizationId });
    await apply(anna, event.id);
    const response = await participants(org, event.id);
    expect(response.status).toBe(200);
    expect(response.body.pending).toHaveLength(1);
  });

  it('несуществующее и неверный id — «Мероприятие недоступно»', async () => {
    for (const id of [randomUUID(), 'не-id']) {
      const response = await participants(organizer, id);
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('event_not_available');
    }
  });
});

describe('POST /participations/:id/accept', () => {
  it('организатор принимает: участник, в шину — ParticipationConfirmed с via: accept', async () => {
    const event = await createEvent();
    const id = await apply(anna, event.id);
    const published = vi.spyOn(app.get(EventBus), 'publish');
    const response = await accept(organizer, id);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id, eventId: event.id, status: 'confirmed' });
    expect(published).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ParticipationConfirmed',
        participationId: id,
        eventId: event.id,
        userId: anna.id,
        via: 'accept',
        actorId: organizer.id,
      }),
    );
    published.mockRestore();
    const row = await prisma.participation.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: 'confirmed', decidedById: organizer.id });
    expect(row.decidedAt).toBeInstanceOf(Date);

    const card = await http().get(`/events/${event.id}`).set('Cookie', anna.cookie);
    expect(card.body.participation).toBe('confirmed');
  });

  it('лимит исчерпан — «Мест нет: увеличьте лимит или дождитесь отмены»', async () => {
    const event = await createEvent({ capacity: 1 });
    const first = await apply(anna, event.id);
    const second = await apply(ksenia, event.id);
    expect((await accept(organizer, first)).status).toBe(200);
    const response = await accept(organizer, second);
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ code: 'no_seats', message: NO_SEATS });
    expect(await statusOf(second)).toBe('pending');
  });

  it('одновременное принятие двух заявок на последнее место не превышает лимит', async () => {
    const event = await createEvent({ capacity: 1 });
    const ids = [await apply(anna, event.id), await apply(ksenia, event.id)];
    // Каждая транзакция после подсчёта мест ждёт вторую (не дольше 500 мс). Без
    // блокировки события обе насчитают ноль занятых и обе примут; с блокировкой вторая
    // считает только после того, как первая завершится
    const repository = app.get(ParticipationsRepository);
    const count = repository.confirmedCount.bind(repository);
    let counted = 0;
    let bothCounted: () => void = () => undefined;
    const barrier = new Promise<undefined>((resolve) => {
      bothCounted = () => resolve(undefined);
    });
    const spy = vi.spyOn(repository, 'confirmedCount').mockImplementation(async (...args) => {
      const confirmed = await count(...args);
      counted += 1;
      if (counted === 2) bothCounted();
      await Promise.race([barrier, new Promise((resolve) => setTimeout(resolve, 500))]);
      return confirmed;
    });
    const responses = await Promise.all(ids.map((id) => accept(organizer, id)));
    spy.mockRestore();
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(
      await prisma.participation.count({ where: { eventId: event.id, status: 'confirmed' } }),
    ).toBe(1);
  });

  it('уже рассмотренную заявку повторно не принять', async () => {
    const event = await createEvent();
    const id = await apply(anna, event.id);
    await reject(organizer, id);
    const response = await accept(organizer, id);
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      code: 'invalid_transition',
      message: 'Заявка уже рассмотрена или отменена',
    });
    expect(await statusOf(id)).toBe('rejected');
  });

  it('администратор, другой пользователь и сам заявитель — «только организатор»', async () => {
    const event = await createEvent();
    const id = await apply(anna, event.id);
    for (const who of [admin, anna, ksenia, org]) {
      const response = await accept(who, id);
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('not_event_organizer');
    }
    expect((await accept(null, id)).status).toBe(401);
    expect(await statusOf(id)).toBe('pending');
  });

  it('у завершившегося и снятого мероприятия решения не меняются', async () => {
    for (const data of [
      { startsAt: inDays(-1), endsAt: inDays(-1, 2) },
      { status: 'unpublished' as const },
    ]) {
      const event = await createEvent();
      const id = await apply(anna, event.id);
      await prisma.event.update({ where: { id: event.id }, data });
      const response = await accept(organizer, id);
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('event_not_joinable');
      expect(await statusOf(id)).toBe('pending');
    }
  });

  it('несуществующая и неверный id — «Не найдено»', async () => {
    for (const id of [randomUUID(), 'не-id']) {
      const response = await accept(organizer, id);
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('not_found');
    }
  });
});

describe('POST /participations/:id/reject', () => {
  it('с причиной: «Заявка отклонена», причина у записи, в шину — ParticipationRejected', async () => {
    const event = await createEvent();
    const id = await apply(ksenia, event.id);
    const published = vi.spyOn(app.get(EventBus), 'publish');
    const response = await reject(organizer, id, { reason: '  Детская группа — по субботам  ' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id, eventId: event.id, status: 'rejected' });
    expect(published).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ParticipationRejected',
        participationId: id,
        eventId: event.id,
        userId: ksenia.id,
        reason: 'Детская группа — по субботам',
        actorId: organizer.id,
      }),
    );
    published.mockRestore();
    const row = await prisma.participation.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({
      status: 'rejected',
      decisionReason: 'Детская группа — по субботам',
      decidedById: organizer.id,
    });
    // После отказа повторная заявка недоступна
    const again = await http()
      .post(`/events/${event.id}/join`)
      .set('Cookie', ksenia.cookie)
      .send({ answer: 'Ещё раз' });
    expect(again.body.code).toBe('rejected_final');
  });

  it('без причины — можно, пустая причина не сохраняется', async () => {
    const event = await createEvent();
    const first = await apply(anna, event.id);
    const second = await apply(ksenia, event.id);
    expect((await reject(organizer, first)).status).toBe(200);
    expect((await reject(organizer, second, { reason: '   ' })).status).toBe(200);
    const rows = await prisma.participation.findMany({
      where: { id: { in: [first, second] } },
      select: { decisionReason: true },
    });
    expect(rows).toEqual([{ decisionReason: null }, { decisionReason: null }]);
  });

  it('причина длиннее 500 символов и с управляющими символами — ошибка поля', async () => {
    const event = await createEvent();
    const id = await apply(anna, event.id);
    for (const reason of ['я'.repeat(501), 'текст\u0000']) {
      const response = await reject(organizer, id, { reason });
      expect(response.status).toBe(400);
      expect(Object.keys(response.body.fields)).toEqual(['reason']);
    }
    expect(await statusOf(id)).toBe('pending');
  });

  it('у администратора отклонения нет', async () => {
    const event = await createEvent();
    const id = await apply(anna, event.id);
    const response = await reject(admin, id, { reason: 'Нет' });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('not_event_organizer');
    expect(await statusOf(id)).toBe('pending');
  });

  it('принятую заявку не отклонить', async () => {
    const event = await createEvent();
    const id = await apply(anna, event.id);
    await accept(organizer, id);
    const response = await reject(organizer, id);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('invalid_transition');
    expect(await statusOf(id)).toBe('confirmed');
  });
});
