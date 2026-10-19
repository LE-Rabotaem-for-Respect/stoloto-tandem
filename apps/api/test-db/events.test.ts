import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { OrganizationStatus } from '@tandem/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { STAND_CONFIG } from '../src/core/config';
import { EventBus } from '../src/core/event-bus';
import { hashPassword } from '../src/modules/auth/password';
import { databaseUrl, participation, prisma } from './db';

const COOKIE = 'tandem_session';
const PASSWORD = 'пароль-1234';
const DAY = 86_400_000;
const inDays = (days: number, hours = 0) => new Date(Date.now() + days * DAY + hours * 3_600_000);

let app: INestApplication;
let passwordHash: string;
let sportId: string;
let hiddenSportId: string;
const http = () => request(app.getHttpServer());

async function account(role: 'user' | 'admin' | 'org', orgStatus?: OrganizationStatus) {
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
        status: orgStatus ?? 'draft',
      },
    });
  }
  const login = await http().post('/auth/login').send({ email, password: PASSWORD });
  if (login.status !== 200) throw new Error(`Вход не удался: ${login.status}`);
  const header = login.headers['set-cookie'] as unknown as string[];
  const cookie = header.find((line) => line.startsWith(`${COOKIE}=`))?.split(';')[0] ?? '';
  return { id: user.id, cookie };
}

const validEvent = () => ({
  title: 'Футбол 7×7 по средам',
  description: 'Играем 7 на 7, команды делим на месте',
  sportId,
  startsAt: inDays(3).toISOString(),
  endsAt: inDays(3, 2).toISOString(),
  city: 'Красноярск',
  area: 'Центральный',
  placeText: 'Поле у школы, вход со двора',
  participantInfo: 'Раздевалка открыта с 18:30',
  mode: 'free',
  level: 'amateur',
});

type Account = Awaited<ReturnType<typeof account>>;
const post = (who: Account | null, body: object) => {
  const req = http().post('/events').send(body);
  return who ? req.set('Cookie', who.cookie) : req;
};
const get = (who: Account | null, id: string) => {
  const req = http().get(`/events/${id}`);
  return who ? req.set('Cookie', who.cookie) : req;
};

let anna: Account;
let igor: Account;
let admin: Account;
let orgApproved: Account;
let orgPending: Account;

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
  hiddenSportId = (
    await prisma.sport.create({
      data: { name: `Скрытое ${tag}`, normalizedName: `скрытое ${tag}`, status: 'hidden' },
    })
  ).id;
  [anna, igor, admin, orgApproved, orgPending] = await Promise.all([
    account('user'),
    account('user'),
    account('admin'),
    account('org', 'approved'),
    account('org', 'pending'),
  ]);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('POST /events', () => {
  it('пользователь публикует от себя: карточка с организатором, статусом и действиями', async () => {
    const published = vi.spyOn(app.get(EventBus), 'publish');
    const response = await post(igor, validEvent());
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      title: 'Футбол 7×7 по средам',
      organizer: { kind: 'user', id: igor.id, name: 'Аккаунт user' },
      sport: { id: sportId, category: 'team', isCustom: false },
      mode: 'free',
      applyQuestion: null,
      level: 'amateur',
      status: 'published',
      displayStatus: 'open',
      participation: null,
      participantInfo: 'Раздевалка открыта с 18:30',
    });
    const codes = (response.body.actions as { code: string }[]).map((action) => action.code);
    expect(codes).toEqual(expect.arrayContaining(['reschedule_event', 'cancel_event']));
    expect(published).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'EventCreated',
        eventId: response.body.id,
        actorId: igor.id,
      }),
    );
    published.mockRestore();
  });

  it('новое направление создаётся одним запросом с мероприятием и сразу доступно в поиске', async () => {
    const name = `Кёрлинг на льду ${randomUUID().slice(0, 6)}`;
    const response = await post(anna, {
      ...validEvent(),
      sportId: undefined,
      newSport: { name, category: 'winter' },
    });
    expect(response.status).toBe(201);
    expect(response.body.sport).toMatchObject({ name, category: 'winter', isCustom: true });

    const search = await http().get('/sports').query({ q: name });
    expect(search.body.items).toEqual([expect.objectContaining({ id: response.body.sport.id })]);
  });

  it('режим «по заявке» сохраняет вопрос к заявке', async () => {
    const response = await post(igor, {
      ...validEvent(),
      mode: 'approval',
      applyQuestion: 'Ваш опыт?',
    });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ mode: 'approval', applyQuestion: 'Ваш опыт?' });
  });

  it('организация публикует от себя только после допуска', async () => {
    const approved = await post(orgApproved, validEvent());
    expect(approved.status).toBe(201);
    expect(approved.body.organizer).toMatchObject({ kind: 'organization' });

    const pending = await post(orgPending, validEvent());
    expect(pending.status).toBe(403);
    expect(pending.body.code).toBe('organization_not_approved');
  });

  it('гость — 401, администратор — 403', async () => {
    expect((await post(null, validEvent())).body).toMatchObject({ code: 'unauthorized' });
    const byAdmin = await post(admin, validEvent());
    expect(byAdmin.status).toBe(403);
    expect(byAdmin.body.code).toBe('forbidden');
  });

  it.each([
    ['короткое название', { title: 'Бег' }, 'title'],
    ['пустое описание', { description: '   ' }, 'description'],
    ['описание длиннее 2000', { description: 'а'.repeat(2001) }, 'description'],
    ['дата без времени и пояса', { startsAt: '2030-01-01' }, 'startsAt'],
    ['нет места', { placeText: '' }, 'placeText'],
    ['неизвестный режим', { mode: 'open' }, 'mode'],
    ['неизвестный уровень', { level: 'pro' }, 'level'],
    ['нет направления', { sportId: undefined }, 'sportId'],
    ['лишнее поле', { organizerOrgId: randomUUID() }, 'organizerOrgId'],
  ])('%s — 400 с полем', async (_, change, field) => {
    const response = await post(anna, { ...validEvent(), ...change });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('validation_failed');
    expect(response.body.fields).toHaveProperty(field);
  });

  it('начало в прошлом, окончание раньше начала, вопрос к заявке в свободном режиме', async () => {
    const response = await post(anna, {
      ...validEvent(),
      startsAt: inDays(-1).toISOString(),
      endsAt: inDays(-2).toISOString(),
      applyQuestion: 'Ваш опыт?',
    });
    expect(response.status).toBe(400);
    expect(response.body.fields).toEqual({
      startsAt: 'Время начала должно быть в будущем',
      endsAt: 'Окончание — позже начала',
      applyQuestion: 'Вопрос к заявке — только для режима «По заявке»',
    });
  });

  it('скрытое или несуществующее направление выбрать нельзя', async () => {
    for (const id of [hiddenSportId, randomUUID()]) {
      const response = await post(anna, { ...validEvent(), sportId: id });
      expect(response.status).toBe(400);
      expect(response.body.fields).toEqual({
        sportId: 'Выберите направление из списка или добавьте новое',
      });
    }
  });

  it('направление из списка и новое одновременно — ошибка, ничего не создаётся', async () => {
    const name = `Городки ${randomUUID().slice(0, 6)}`;
    const response = await post(anna, { ...validEvent(), newSport: { name } });
    expect(response.status).toBe(400);
    expect(response.body.fields).toHaveProperty('sportId');
    expect(await prisma.sport.count({ where: { name } })).toBe(0);
  });
});

describe('GET /events/:id', () => {
  let eventId: string;

  beforeAll(async () => {
    eventId = (await post(igor, validEvent())).body.id;
  });

  it('«Информация для участников» — подтверждённому участнику, организатору и администратору', async () => {
    const [confirmed, pending] = await Promise.all([account('user'), account('user')]);
    await participation(eventId, confirmed.id, 'confirmed');
    await participation(eventId, pending.id, 'pending');

    const info = async (who: Account | null) => (await get(who, eventId)).body.participantInfo;
    expect(await info(igor)).toBe('Раздевалка открыта с 18:30');
    expect(await info(confirmed)).toBe('Раздевалка открыта с 18:30');
    expect(await info(admin)).toBe('Раздевалка открыта с 18:30');
    expect(await info(pending)).toBeNull();
    expect(await info(anna)).toBeNull();
    expect(await info(orgApproved)).toBeNull();
    expect(await info(null)).toBeNull();

    const forParticipant = await get(confirmed, eventId);
    expect(forParticipant.body.participation).toBe('confirmed');
  });

  it('гость видит опубликованное мероприятие, запись предлагает после входа', async () => {
    const response = await get(null, eventId);
    expect(response.status).toBe(200);
    expect(response.body.actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'join', requiresAuth: true })]),
    );
  });

  it('снятое с публикации: постороннему — «Мероприятие недоступно», записавшемуся — карточка', async () => {
    const id = (await post(igor, validEvent())).body.id as string;
    const participant = await account('user');
    await participation(id, participant.id, 'confirmed');
    await prisma.event.update({
      where: { id },
      data: {
        status: 'unpublished',
        statusReason: 'Нарушение правил',
        statusChangedAt: new Date(),
      },
    });

    const stranger = await get(anna, id);
    expect(stranger.status).toBe(404);
    expect(stranger.body).toEqual({
      code: 'event_not_available',
      message: 'Мероприятие недоступно',
    });

    const forParticipant = await get(participant, id);
    expect(forParticipant.status).toBe(200);
    expect(forParticipant.body).toMatchObject({
      status: 'unpublished',
      displayStatus: 'unpublished',
      statusReason: 'Нарушение правил',
    });
  });

  it('мероприятие со скрытым направлением показывается в группе «Другое»', async () => {
    const id = (await post(igor, validEvent())).body.id as string;
    const event = await prisma.event.findUniqueOrThrow({ where: { id } });
    await prisma.sport.update({ where: { id: event.sportId }, data: { status: 'hidden' } });
    const response = await get(anna, id);
    await prisma.sport.update({ where: { id: event.sportId }, data: { status: 'active' } });
    expect(response.body.sport.category).toBe('other');
  });

  it.each(['не-uuid', randomUUID()])('несуществующее мероприятие (%s) — 404', async (id) => {
    const response = await get(anna, id);
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('event_not_available');
  });
});
