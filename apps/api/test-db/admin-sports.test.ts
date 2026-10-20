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
import { createOrganization, createUser, databaseUrl, eventData, prisma } from './db';

// Среда, 21 октября 2026, 10:00 по Красноярску
const NOW = '2026-10-21T03:00:00Z';
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

async function signUp() {
  const response = await http()
    .post('/auth/register')
    .send({
      accountType: 'person',
      name: 'Иван Петров',
      email: `person-${randomUUID()}@example.ru`,
      password: 'пароль-1234',
    });
  const header = response.headers['set-cookie'] as unknown as string[];
  const cookie = header.find((line) => line.startsWith('tandem_session='))?.split(';')[0] ?? '';
  return { cookie, id: (response.body as { id: string }).id };
}

/** Администратор — обычный аккаунт с ролью admin в базе: guard берёт роль из базы. */
async function admin() {
  const { cookie, id } = await signUp();
  await prisma.user.update({ where: { id }, data: { role: 'admin' } });
  return cookie;
}

/** Направление с уникальным для прогона именем; `name` — без тега. */
function sport(name: string, data: { isCustom?: boolean; status?: 'active' | 'hidden' } = {}) {
  const full = `${name} ${tag}`;
  return prisma.sport.create({
    data: { name: full, normalizedName: full.toLowerCase(), ...data },
  });
}

async function eventOn(sportId: string, title = 'Тренировка') {
  const organizer = await createUser();
  return prisma.event.create({
    data: { ...eventData(sportId), title, organizerUserId: organizer.id },
  });
}

describe('доступ к каталогу направлений', () => {
  it('гостю — 401, пользователю — 403, на каждом маршруте', async () => {
    const person = await signUp();
    const id = randomUUID();
    const routes = [
      () => http().get('/admin/sports'),
      () => http().post(`/admin/sports/${id}/rename`).send({ name: 'Падел' }),
      () => http().post(`/admin/sports/${id}/merge`).send({ targetId: randomUUID() }),
      () => http().post(`/admin/sports/${id}/promote`).send({ category: 'team' }),
      () => http().post(`/admin/sports/${id}/hide`),
    ];
    for (const route of routes) {
      expect((await route()).status).toBe(401);
      expect((await route().set('Cookie', person.cookie)).status).toBe(403);
    }
  });
});

describe('список', () => {
  it('поиск по имени и прежнему имени, пользовательские и скрытые, число мероприятий', async () => {
    const cookie = await admin();
    const padel = await sport('Падел', { isCustom: true });
    await prisma.sport.update({
      where: { id: padel.id },
      data: { aliases: [`паддл ${tag}`] },
    });
    const hidden = await sport('Падел ошибка', { isCustom: true, status: 'hidden' });
    await eventOn(padel.id);
    await eventOn(padel.id);

    const byName = await http().get('/admin/sports').set('Cookie', cookie).query({ q: tag });
    expect(byName.body.items.map((item: { id: string }) => item.id)).toEqual([padel.id, hidden.id]);
    expect(byName.body.items[0]).toMatchObject({
      name: `Падел ${tag}`,
      isCustom: true,
      status: 'active',
      eventCount: 2,
    });
    expect(byName.body.items[1]).toMatchObject({ status: 'hidden', eventCount: 0 });

    const byAlias = await http()
      .get('/admin/sports')
      .set('Cookie', cookie)
      .query({ q: `Паддл ${tag}` });
    expect(byAlias.body.items.map((item: { id: string }) => item.id)).toEqual([padel.id]);

    const onlyHidden = await http()
      .get('/admin/sports')
      .set('Cookie', cookie)
      .query({ q: tag, status: 'hidden', custom: 'true' });
    expect(onlyHidden.body.items.map((item: { id: string }) => item.id)).toEqual([hidden.id]);
  });
});

describe('переименование', () => {
  it('прежнее имя — в алиасы: подсказки по-прежнему находят направление', async () => {
    const cookie = await admin();
    const badminton = await sport('Бадминтн', { isCustom: true });

    const response = await http()
      .post(`/admin/sports/${badminton.id}/rename`)
      .set('Cookie', cookie)
      .send({ name: `  Бадминтон   ${tag} ` });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ name: `Бадминтон ${tag}`, aliases: [`бадминтн ${tag}`] });

    const suggestions = await http()
      .get('/sports')
      .query({ q: `бадминтн ${tag}` });
    expect(suggestions.body.items.map((item: { id: string }) => item.id)).toEqual([badminton.id]);
  });

  it('имя другого направления занять нельзя; неверное имя и неизвестный адрес — ошибки', async () => {
    const cookie = await admin();
    const [squash, tennis] = await Promise.all([sport('Сквош'), sport('Теннис')]);

    const taken = await http()
      .post(`/admin/sports/${tennis.id}/rename`)
      .set('Cookie', cookie)
      .send({ name: `сквош ${tag}` });
    expect(taken.status).toBe(400);
    expect(taken.body.fields.name).toBe(
      `Такое направление уже есть: «Сквош ${tag}». Объедините с ним`,
    );

    const invalid = await http()
      .post(`/admin/sports/${tennis.id}/rename`)
      .set('Cookie', cookie)
      .send({ name: '!' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.fields).toHaveProperty('name');

    for (const id of ['not-a-uuid', randomUUID()]) {
      const missing = await http()
        .post(`/admin/sports/${id}/rename`)
        .set('Cookie', cookie)
        .send({ name: 'Сквош' });
      expect(missing.status).toBe(404);
      expect(missing.body.message).toBe('Направление не найдено');
    }
    expect((await prisma.sport.findUniqueOrThrow({ where: { id: squash.id } })).name).toBe(
      `Сквош ${tag}`,
    );
  });
});

describe('объединение дублей', () => {
  it('мероприятия, направления людей и организаций переходят на целевое; дубль скрыт, его имя — алиас', async () => {
    const cookie = await admin();
    const [duplicate, target] = await Promise.all([
      sport('Пиклбол клуб', { isCustom: true }),
      sport('Пиклбол'),
    ]);
    const event = await eventOn(duplicate.id, 'Пиклбол по средам');
    const [both, onlyDuplicate] = await Promise.all([createUser(), createUser()]);
    await prisma.userSport.createMany({
      data: [
        { userId: both.id, sportId: duplicate.id, level: 'beginner' },
        { userId: both.id, sportId: target.id, level: 'amateur' },
        { userId: onlyDuplicate.id, sportId: duplicate.id, level: 'beginner' },
      ],
    });
    const [orgBoth, orgDuplicate] = await Promise.all([createOrganization(), createOrganization()]);
    await prisma.organizationSport.createMany({
      data: [
        { organizationId: orgBoth.id, sportId: duplicate.id },
        { organizationId: orgBoth.id, sportId: target.id },
        { organizationId: orgDuplicate.id, sportId: duplicate.id },
      ],
    });
    const accessory = await prisma.accessory.create({
      data: { code: `padel-${tag}`, title: 'Значок', icon: 'badge' },
    });
    const at = new Date(NOW);
    await prisma.userAccessory.createMany({
      data: [
        { userId: both.id, accessoryId: accessory.id, sportId: duplicate.id, unlockedAt: at },
        { userId: both.id, accessoryId: accessory.id, sportId: target.id, unlockedAt: at },
        {
          userId: onlyDuplicate.id,
          accessoryId: accessory.id,
          sportId: duplicate.id,
          unlockedAt: at,
        },
      ],
    });
    const companyRequest = await prisma.companyRequest.create({
      data: {
        userId: onlyDuplicate.id,
        sportId: duplicate.id,
        level: 'beginner',
        area: 'Центральный',
        timeSlots: [],
        activeUntil: new Date('2026-11-01T00:00:00Z'),
        createdAt: at,
      },
    });

    const response = await http()
      .post(`/admin/sports/${duplicate.id}/merge`)
      .set('Cookie', cookie)
      .send({ targetId: target.id });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: target.id,
      aliases: [`пиклбол клуб ${tag}`],
      eventCount: 1,
    });

    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).sportId).toBe(
      target.id,
    );
    const userSports = await prisma.userSport.findMany({
      where: { userId: { in: [both.id, onlyDuplicate.id] } },
    });
    expect(userSports.map((row) => [row.userId, row.sportId]).sort()).toEqual(
      [
        [both.id, target.id],
        [onlyDuplicate.id, target.id],
      ].sort(),
    );
    const orgSports = await prisma.organizationSport.findMany({
      where: { organizationId: { in: [orgBoth.id, orgDuplicate.id] } },
    });
    expect(orgSports.every((row) => row.sportId === target.id)).toBe(true);
    expect(orgSports).toHaveLength(2);
    const accessories = await prisma.userAccessory.findMany({
      where: { accessoryId: accessory.id },
    });
    expect(accessories.every((row) => row.sportId === target.id)).toBe(true);
    expect(accessories).toHaveLength(2);
    expect(
      (await prisma.companyRequest.findUniqueOrThrow({ where: { id: companyRequest.id } })).sportId,
    ).toBe(target.id);
    expect(await prisma.sport.findUniqueOrThrow({ where: { id: duplicate.id } })).toMatchObject({
      status: 'hidden',
      aliases: [],
    });

    // Старое имя ведёт к целевому: в подсказках и при создании мероприятия
    const suggestions = await http()
      .get('/sports')
      .query({ q: `пиклбол клуб ${tag}` });
    expect(suggestions.body.items.map((item: { id: string }) => item.id)).toEqual([target.id]);
    const organizer = await signUp();
    const created = await http()
      .post('/events')
      .set('Cookie', organizer.cookie)
      .send({
        title: 'Пиклбол по пятницам',
        description: 'Играем пары',
        newSport: { name: `Пиклбол клуб ${tag}` },
        startsAt: '2026-10-23T12:00:00Z',
        endsAt: '2026-10-23T13:30:00Z',
        city: 'Красноярск',
        area: 'Центральный',
        placeText: 'Корты',
        mode: 'free',
        level: 'any',
      });
    expect(created.status).toBe(201);
    expect(created.body.sport.id).toBe(target.id);
  });

  it('с самим собой, со скрытым и с неизвестным — ошибка поля, ничего не меняется', async () => {
    const cookie = await admin();
    const [duplicate, hidden] = await Promise.all([
      sport('Сквош клуб', { isCustom: true }),
      sport('Сквош скрытый', { status: 'hidden' }),
    ]);
    const event = await eventOn(duplicate.id);
    for (const [targetId, message] of [
      [duplicate.id, 'Выберите другое направление'],
      [hidden.id, 'Скрытое направление не может принять дубль'],
      [randomUUID(), 'Направление не найдено'],
    ]) {
      const response = await http()
        .post(`/admin/sports/${duplicate.id}/merge`)
        .set('Cookie', cookie)
        .send({ targetId });
      expect(response.status).toBe(400);
      expect(response.body.fields).toEqual({ targetId: message });
    }
    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).sportId).toBe(
      duplicate.id,
    );
    expect((await prisma.sport.findUniqueOrThrow({ where: { id: duplicate.id } })).status).toBe(
      'active',
    );
  });
});

describe('основной список и скрытие', () => {
  it('«В основной список» — пользовательское становится основным в выбранной группе', async () => {
    const cookie = await admin();
    const custom = await sport('Сапсерфинг', { isCustom: true });
    const response = await http()
      .post(`/admin/sports/${custom.id}/promote`)
      .set('Cookie', cookie)
      .send({ category: 'water' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ isCustom: false, category: 'water' });

    const unknown = await http()
      .post(`/admin/sports/${custom.id}/promote`)
      .set('Cookie', cookie)
      .send({ category: 'space' });
    expect(unknown.status).toBe(400);
  });

  it('«Скрыть» — нет в подсказках, мероприятие остаётся и показывается в группе «Другое»', async () => {
    const cookie = await admin();
    const wrong = await sport('Футбол на ушах', { isCustom: true });
    const event = await eventOn(wrong.id, 'Странный футбол');

    const response = await http().post(`/admin/sports/${wrong.id}/hide`).set('Cookie', cookie);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'hidden', eventCount: 1 });

    const suggestions = await http()
      .get('/sports')
      .query({ q: `футбол на ушах ${tag}` });
    expect(suggestions.body.items).toEqual([]);
    const card = await http().get(`/events/${event.id}`);
    expect(card.status).toBe(200);
    expect(card.body.sport).toMatchObject({ name: 'Другое', category: 'other' });
  });
});
