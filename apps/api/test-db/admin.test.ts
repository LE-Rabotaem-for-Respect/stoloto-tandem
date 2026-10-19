import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { REAL_TIME } from '../src/core/clock';
import { AUTH_LIMITS } from '../src/modules/auth/attempt-limiter';
import { createSport, createUser, databaseUrl, prisma } from './db';

// Среда, 21 октября 2026, 10:00 по Красноярску
const NOW = '2026-10-21T03:00:00Z';
const DAY = 24 * 60 * 60 * 1000;
const tag = randomUUID().slice(0, 8);

let app: INestApplication;
const http = () => request(app.getHttpServer());

beforeAll(async () => {
  process.env.DATABASE_URL = databaseUrl;
  process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef';
  const many = { attempts: 10_000, windowMs: 60_000 };
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    // Лимиты попыток проверяет auth-limits.test.ts; здесь все регистрации идут с одного адреса
    .overrideProvider(AUTH_LIMITS)
    .useValue({
      loginPerIp: many,
      loginPerEmail: many,
      registerPerIp: many,
      registerPerEmail: many,
    })
    .overrideProvider(REAL_TIME)
    .useValue(() => Date.parse(NOW))
    .compile();
  app = configureApp(moduleRef.createNestApplication());
  await app.init();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

async function signUp(accountType: 'person' | 'organization', organizationName = 'Клуб') {
  const response = await http()
    .post('/auth/register')
    .send({
      accountType,
      name: 'Иван Петров',
      email: `${accountType}-${randomUUID()}@example.ru`,
      password: 'пароль-1234',
      organizationName,
    });
  const header = response.headers['set-cookie'] as unknown as string[];
  const cookie = header.find((line) => line.startsWith('tandem_session='))?.split(';')[0] ?? '';
  return { cookie, body: response.body as { id: string; organization: { id: string } | null } };
}

/** Администратор — обычный аккаунт с ролью admin в базе: guard берёт роль из базы. */
async function admin() {
  const { cookie, body } = await signUp('person');
  await prisma.user.update({ where: { id: body.id }, data: { role: 'admin' } });
  return cookie;
}

/** Организация с полным профилем, отправленная на проверку. */
async function pendingOrganization(name: string) {
  const { cookie, body } = await signUp('organization', name);
  const id = body.organization?.id ?? '';
  const sport = await createSport();
  await http()
    .patch(`/organizations/${id}`)
    .set('Cookie', cookie)
    .send({
      description: 'Турниры и занятия',
      city: 'Красноярск',
      contacts: '+7 391 000-00-01',
      representativeRole: 'Тренер',
      sportIds: [sport.id],
    });
  const submitted = await http().post(`/organizations/${id}/submit`).set('Cookie', cookie);
  expect(submitted.body).toMatchObject({ status: 'pending' });
  return { id, cookie };
}

describe('доступ к админке', () => {
  it('гостю — 401, пользователю и организации — 403, на каждом маршруте', async () => {
    const person = await signUp('person');
    const organization = await signUp('organization');
    const routes = [
      () => http().get('/admin/overview'),
      () => http().get('/admin/organizations'),
      () => http().get('/admin/events'),
      () =>
        http().post(`/admin/organizations/${randomUUID()}/decision`).send({ decision: 'approve' }),
    ];
    for (const route of routes) {
      expect((await route()).status).toBe(401);
      expect((await route().set('Cookie', person.cookie)).status).toBe(403);
      expect((await route().set('Cookie', organization.cookie)).status).toBe(403);
    }
  });
});

describe('обзор', () => {
  it('плитки: заявки на проверке, снятые за неделю мероприятия, скрытые сообщения', async () => {
    const cookie = await admin();
    const before = (await http().get('/admin/overview').set('Cookie', cookie)).body as Record<
      string,
      number
    >;

    await pendingOrganization(`Обзор ${tag}`);
    const [organizer, sport] = await Promise.all([createUser(), createSport()]);
    const base = {
      organizerUserId: organizer.id,
      sportId: sport.id,
      title: 'Снятое мероприятие',
      description: 'Описание',
      startsAt: new Date(Date.parse(NOW) + DAY),
      endsAt: new Date(Date.parse(NOW) + DAY + 3_600_000),
      city: 'Красноярск',
      area: 'Центр',
      placeText: 'Стадион',
      createdAt: new Date(Date.parse(NOW) - 30 * DAY),
    };
    const recent = await prisma.event.create({
      data: {
        ...base,
        status: 'unpublished',
        statusChangedAt: new Date(Date.parse(NOW) - 2 * DAY),
      },
    });
    // Снято 8 дней назад — в «за неделю» не входит
    await prisma.event.create({
      data: {
        ...base,
        status: 'unpublished',
        statusChangedAt: new Date(Date.parse(NOW) - 8 * DAY),
      },
    });
    await prisma.message.create({
      data: {
        eventId: recent.id,
        authorUserId: organizer.id,
        text: 'Скрытое сообщение',
        status: 'hidden_by_moderator',
        createdAt: new Date(NOW),
      },
    });

    const after = await http().get('/admin/overview').set('Cookie', cookie);
    expect(after.status).toBe(200);
    expect(after.body).toEqual({
      pendingOrganizations: (before.pendingOrganizations ?? 0) + 1,
      unpublishedEventsLastWeek: (before.unpublishedEventsLastWeek ?? 0) + 1,
      hiddenMessages: (before.hiddenMessages ?? 0) + 1,
    });
  });
});

describe('очередь заявок организаций', () => {
  it('на проверке — по времени отправки, с представителем и статусом', async () => {
    const cookie = await admin();
    const first = await pendingOrganization(`Очередь-1 ${tag}`);
    const second = await pendingOrganization(`Очередь-2 ${tag}`);

    const queue = await http()
      .get('/admin/organizations')
      .query({ status: 'pending', limit: 50 })
      .set('Cookie', cookie);
    expect(queue.status).toBe(200);
    const ids = (queue.body.items as { id: string }[]).map((item) => item.id);
    expect(ids.indexOf(first.id)).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf(first.id)).toBeLessThan(ids.indexOf(second.id));
    const item = (queue.body.items as Record<string, unknown>[]).find(
      (entry) => entry.id === first.id,
    );
    expect(item).toMatchObject({
      status: 'pending',
      representativeName: 'Иван Петров',
      representativeRole: 'Тренер',
    });
  });

  it('«Одобрить» — организация сразу видит статус и может публиковать', async () => {
    const cookie = await admin();
    const organization = await pendingOrganization(`Одобрить ${tag}`);

    const approved = await http()
      .post(`/admin/organizations/${organization.id}/decision`)
      .set('Cookie', cookie)
      .send({ decision: 'approve' });
    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({ status: 'approved' });

    const own = await http()
      .get(`/organizations/${organization.id}`)
      .set('Cookie', organization.cookie);
    expect(own.body).toMatchObject({ status: 'approved' });

    // Повторное решение по уже одобренной — отказ автомата, статус не меняется
    const again = await http()
      .post(`/admin/organizations/${organization.id}/decision`)
      .set('Cookie', cookie)
      .send({ decision: 'reject', reason: 'Поздно' });
    expect(again.status).toBe(409);
  });

  it('«Отклонить» — только с причиной; организация видит причину', async () => {
    const cookie = await admin();
    const organization = await pendingOrganization(`Отклонить ${tag}`);

    for (const reason of [undefined, '', '   ']) {
      const noReason = await http()
        .post(`/admin/organizations/${organization.id}/decision`)
        .set('Cookie', cookie)
        .send({ decision: 'reject', reason });
      expect(noReason.status).toBe(400);
      expect(noReason.body.fields).toHaveProperty('reason');
    }

    const rejected = await http()
      .post(`/admin/organizations/${organization.id}/decision`)
      .set('Cookie', cookie)
      .send({ decision: 'reject', reason: '  Не указаны контакты представителя  ' });
    expect(rejected.status).toBe(200);
    expect(rejected.body).toMatchObject({
      status: 'rejected',
      decisionReason: 'Не указаны контакты представителя',
    });

    const own = await http()
      .get(`/organizations/${organization.id}`)
      .set('Cookie', organization.cookie);
    expect(own.body).toMatchObject({
      status: 'rejected',
      decisionReason: 'Не указаны контакты представителя',
    });
  });

  it('неизвестное решение и неверный адрес — ошибка поля и 404', async () => {
    const cookie = await admin();
    const organization = await pendingOrganization(`Ошибки ${tag}`);
    const unknown = await http()
      .post(`/admin/organizations/${organization.id}/decision`)
      .set('Cookie', cookie)
      .send({ decision: 'delete' });
    expect(unknown.status).toBe(400);
    expect(unknown.body.fields).toHaveProperty('decision');

    const badId = await http()
      .post('/admin/organizations/не-uuid/decision')
      .set('Cookie', cookie)
      .send({ decision: 'approve' });
    expect(badId.status).toBe(404);
    const missing = await http()
      .post(`/admin/organizations/${randomUUID()}/decision`)
      .set('Cookie', cookie)
      .send({ decision: 'approve' });
    expect(missing.status).toBe(404);
  });
});

describe('поиск', () => {
  it('организации — по названию без учёта регистра, с фильтром по статусу; % — обычный символ', async () => {
    const cookie = await admin();
    const found = await pendingOrganization(`Шахматы ${tag}`);
    await pendingOrganization(`Падел ${tag}`);

    const byText = await http()
      .get('/admin/organizations')
      .query({ q: `шахматы ${tag}` })
      .set('Cookie', cookie);
    expect((byText.body.items as { id: string }[]).map((item) => item.id)).toEqual([found.id]);
    expect(byText.body).toMatchObject({ total: 1, limit: 20, offset: 0 });

    const approvedOnly = await http()
      .get('/admin/organizations')
      .query({ q: tag, status: 'approved' })
      .set('Cookie', cookie);
    expect(approvedOnly.body.items).toEqual([]);

    const percent = await http()
      .get('/admin/organizations')
      .query({ q: `%${tag}` })
      .set('Cookie', cookie);
    expect(percent.body.items).toEqual([]);

    const badStatus = await http()
      .get('/admin/organizations')
      .query({ status: 'secret' })
      .set('Cookie', cookie);
    expect(badStatus.status).toBe(400);
  });

  it('мероприятия — любые статусы, по названию; мероприятия организации — по её id', async () => {
    const cookie = await admin();
    const [organizer, sport] = await Promise.all([createUser(), createSport()]);
    const organization = await pendingOrganization(`Организатор ${tag}`);
    const common = {
      sportId: sport.id,
      description: 'Описание',
      startsAt: new Date(Date.parse(NOW) + DAY),
      endsAt: new Date(Date.parse(NOW) + DAY + 3_600_000),
      city: 'Красноярск',
      area: 'Центр',
      placeText: 'Стадион',
      statusChangedAt: new Date(NOW),
    };
    const removed = await prisma.event.create({
      data: {
        ...common,
        organizerUserId: organizer.id,
        title: `Удалённое ${tag}`,
        status: 'deleted',
        statusReason: 'Реклама',
        createdAt: new Date(Date.parse(NOW) - DAY),
      },
    });
    const orgEvent = await prisma.event.create({
      data: {
        ...common,
        organizerOrgId: organization.id,
        title: `Турнир ${tag}`,
        createdAt: new Date(NOW),
      },
    });

    const all = await http().get('/admin/events').query({ q: tag }).set('Cookie', cookie);
    expect(all.status).toBe(200);
    // Новые сверху
    expect((all.body.items as { id: string }[]).map((item) => item.id)).toEqual([
      orgEvent.id,
      removed.id,
    ]);
    expect(all.body.items[1]).toMatchObject({
      status: 'deleted',
      statusReason: 'Реклама',
      organizer: { kind: 'user', id: organizer.id, name: 'Анна' },
    });
    expect(Object.keys(all.body.items[1] as object).sort()).toEqual([
      'city',
      'createdAt',
      'id',
      'organizer',
      'sport',
      'startsAt',
      'status',
      'statusReason',
      'title',
    ]);

    const deletedOnly = await http()
      .get('/admin/events')
      .query({ q: tag, status: 'deleted' })
      .set('Cookie', cookie);
    expect((deletedOnly.body.items as { id: string }[]).map((item) => item.id)).toEqual([
      removed.id,
    ]);

    const ofOrganization = await http()
      .get('/admin/events')
      .query({ organizationId: organization.id })
      .set('Cookie', cookie);
    expect((ofOrganization.body.items as { id: string }[]).map((item) => item.id)).toEqual([
      orgEvent.id,
    ]);
    expect(ofOrganization.body.items[0].organizer).toEqual({
      kind: 'organization',
      id: organization.id,
      name: `Организатор ${tag}`,
    });
  });
});
