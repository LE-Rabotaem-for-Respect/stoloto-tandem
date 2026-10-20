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
    // Строго: без почты и других полей аккаунта
    expect(response.body.organizer).toEqual({ kind: 'user', id: igor.id, name: 'Аккаунт user' });
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

  it('не строка в названии и городе — сообщение о поле, а не о символах', async () => {
    const response = await post(anna, { ...validEvent(), title: 5, city: 5 });
    expect(response.status).toBe(400);
    expect(response.body.fields).toMatchObject({
      title: 'Укажите название',
      city: 'Укажите город',
    });
  });

  it('эмодзи с соединителем и селектором начертания и мягкий перенос — допустимы', async () => {
    const runner = String.fromCodePoint(0x1f3c3, 0x200d, 0x2640, 0xfe0f);
    const softHyphen = String.fromCodePoint(0xad);
    const title = `Бег ${runner} вместе`;
    const description = `Пробеж${softHyphen}ка по набережной ${runner}`;
    const response = await post(igor, { ...validEvent(), title, description });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ title, description });
  });

  it('мягкий перенос в названии убирается: мероприятие находится поиском', async () => {
    const response = await post(igor, {
      ...validEvent(),
      title: `Кёр${String.fromCodePoint(0xad)}линг для новичков`,
      city: `Крас${String.fromCodePoint(0xad)}ноярск`,
    });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ title: 'Кёрлинг для новичков', city: 'Красноярск' });
    const stored = await prisma.event.findUniqueOrThrow({ where: { id: response.body.id } });
    expect(stored.title).toBe('Кёрлинг для новичков');
  });

  it('в описании и «Информации для участников» допустимы переводы строк', async () => {
    const newline = String.fromCharCode(10);
    const description = `Играем 7 на 7${newline}Команды делим на месте`;
    const response = await post(igor, { ...validEvent(), description });
    expect(response.status).toBe(201);
    expect(response.body.description).toBe(description);
  });

  it('переводы строк Windows в описании сохраняются как обычные', async () => {
    const [cr, lf] = [String.fromCharCode(13), String.fromCharCode(10)];
    const response = await post(igor, {
      ...validEvent(),
      description: `Играем 7 на 7${cr}${lf}Команды делим на месте${cr}Мяч есть`,
      participantInfo: `Вход со двора${cr}${lf}Раздевалка открыта`,
    });
    expect(response.status).toBe(201);
    expect(response.body.description).toBe(`Играем 7 на 7${lf}Команды делим на месте${lf}Мяч есть`);
    expect(response.body.participantInfo).toBe(`Вход со двора${lf}Раздевалка открыта`);
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
    expect(Object.keys(approved.body.organizer).sort()).toEqual(['id', 'kind', 'name']);
    expect(approved.body.organizer.kind).toBe('organization');

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
    ['несуществующий день', { startsAt: '2030-02-30T10:00:00Z' }, 'startsAt'],
    ['нет места', { placeText: '' }, 'placeText'],
    ['неизвестный режим', { mode: 'open' }, 'mode'],
    ['неизвестный уровень', { level: 'pro' }, 'level'],
    ['нет направления', { sportId: undefined }, 'sportId'],
    ['нет направления, новое — null', { sportId: undefined, newSport: null }, 'sportId'],
    ['новое направление — пустой массив', { sportId: undefined, newSport: [] }, 'newSport'],
    [
      'новое направление — массив объектов',
      { sportId: undefined, newSport: [{ name: 'Падел' }] },
      'newSport',
    ],
    [
      'изоляция направления текста в названии',
      { title: `Футбол 7×7 ${String.fromCodePoint(0x2066)}` },
      'title',
    ],
    ['невидимый пробел в районе', { area: `Цент${String.fromCodePoint(0x200b)}ральный` }, 'area'],
    // По краям U+FEFF снял бы trim — ставим в середину, чтобы проверить само правило
    ['BOM в середине города', { city: `Красно${String.fromCodePoint(0xfeff)}ярск` }, 'city'],
    [
      'метка слева направо в месте',
      { placeText: `Поле ${String.fromCodePoint(0x200e)}у школы` },
      'placeText',
    ],
    [
      'метка справа налево в названии',
      { title: `Футбол ${String.fromCodePoint(0x200f)}7×7` },
      'title',
    ],
    ['арабская метка в названии', { title: `Футбол ${String.fromCodePoint(0x61c)}7×7` }, 'title'],
    // Не перечень символов, а классы невидимого целиком
    [
      'невидимый оператор внутри слова в названии',
      { title: `Фут${String.fromCodePoint(0x2063)}бол 7×7` },
      'title',
    ],
    ['тег в названии', { title: `Футбол 7×7 ${String.fromCodePoint(0xe0041)}` }, 'title'],
    [
      'заполнитель хангыля вместо названия',
      { title: String.fromCodePoint(0x3164).repeat(5) },
      'title',
    ],
    [
      'подстрочная аннотация в названии',
      { title: `Футбол ${String.fromCodePoint(0xfff9)}7×7` },
      'title',
    ],
    [
      'разделитель строк в названии',
      { title: `Футбол${String.fromCodePoint(0x2028)}7×7` },
      'title',
    ],
    [
      'разделитель абзацев в описании',
      { description: `Играем${String.fromCodePoint(0x2029)}7 на 7` },
      'description',
    ],
    [
      'словесный соединитель в районе',
      { area: `Цент${String.fromCodePoint(0x2060)}ральный` },
      'area',
    ],
    // Многострочные поля: переводы строк можно, остальное — нет
    [
      'переворот текста в описании',
      { description: `Играем ${String.fromCodePoint(0x202e)}7 на 7` },
      'description',
    ],
    [
      'управляющий символ в «Информации для участников»',
      { participantInfo: `Раздевалка ${String.fromCodePoint(0x7)}открыта` },
      'participantInfo',
    ],
    [
      'изоляция направления в вопросе к заявке',
      { mode: 'approval', applyQuestion: `Ваш ${String.fromCodePoint(0x2067)}опыт?` },
      'applyQuestion',
    ],
    ['неверный sportId, новое — null', { sportId: 'not-a-uuid', newSport: null }, 'sportId'],
    ['переворот текста в названии', { title: 'Футбол 7×7 \u202e' }, 'title'],
    ['управляющий символ в месте', { placeText: 'Поле \u0007 у школы' }, 'placeText'],
    // Разрешённые невидимые — только на своём месте; пустое на вид поле не проходит
    [
      'пять соединителей вместо названия',
      { title: String.fromCodePoint(0x200d).repeat(5) },
      'title',
    ],
    [
      'соединитель внутри слова в названии',
      { title: `Фут${String.fromCodePoint(0x200d)}бол 7×7` },
      'title',
    ],
    [
      'селектор начертания после буквы в названии',
      { title: `Фут${String.fromCodePoint(0xfe0f)}бол 7×7` },
      'title',
    ],
    [
      'пустые символы Брайля вместо названия',
      { title: String.fromCodePoint(0x2800).repeat(5) },
      'title',
    ],
    ['мягкие переносы вместо названия', { title: String.fromCodePoint(0xad).repeat(5) }, 'title'],
    ['название из одних точек', { title: '.....' }, 'title'],
    ['город из тире', { city: '— —' }, 'city'],
    ['район из одних эмодзи', { area: String.fromCodePoint(0x1f3c3, 0x1f3c3) }, 'area'],
    ['место из знаков', { placeText: '--- ...' }, 'placeText'],
    [
      'частный символ в описании',
      { description: `Играем ${String.fromCodePoint(0xe000)}` },
      'description',
    ],
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
    const [confirmed, pending, waitlist, rejected, cancelled] = await Promise.all([
      account('user'),
      account('user'),
      account('user'),
      account('user'),
      account('user'),
    ]);
    await participation(eventId, confirmed.id, 'confirmed');
    await participation(eventId, pending.id, 'pending');
    await participation(eventId, waitlist.id, 'waitlist');
    await participation(eventId, rejected.id, 'rejected');
    await participation(eventId, cancelled.id, 'cancelled');

    const info = async (who: Account | null) => (await get(who, eventId)).body.participantInfo;
    expect(await info(igor)).toBe('Раздевалка открыта с 18:30');
    expect(await info(confirmed)).toBe('Раздевалка открыта с 18:30');
    expect(await info(admin)).toBe('Раздевалка открыта с 18:30');
    expect(await info(pending)).toBeNull();
    expect(await info(waitlist)).toBeNull();
    expect(await info(rejected)).toBeNull();
    expect(await info(cancelled)).toBeNull();
    expect(await info(anna)).toBeNull();
    expect(await info(orgApproved)).toBeNull();
    expect(await info(null)).toBeNull();

    const forParticipant = await get(confirmed, eventId);
    expect(forParticipant.body.participation).toBe('confirmed');
  });

  it('после перемотки демо-часов назад «новее» оказалась отменённая запись — участник всё равно участник', async () => {
    const viewer = await account('user');
    // Записался и отменил, часы перемотали назад, записался снова: отменённая запись
    // создана раньше по порядку, но её время по Clock позже, чем у активной
    await prisma.participation.create({
      data: {
        eventId,
        userId: viewer.id,
        status: 'cancelled',
        createdAt: new Date('2026-10-20T10:00:00Z'),
        updatedAt: new Date('2026-10-20T10:00:00Z'),
      },
    });
    await prisma.participation.create({
      data: {
        eventId,
        userId: viewer.id,
        status: 'confirmed',
        createdAt: new Date('2026-10-19T10:00:00Z'),
        updatedAt: new Date('2026-10-19T10:00:00Z'),
      },
    });
    const response = await get(viewer, eventId);
    expect(response.body.participation).toBe('confirmed');
    expect(response.body.participantInfo).toBe('Раздевалка открыта с 18:30');
  });

  it('причина отказа — только тому, кому отказали; без причины и у других статусов — null', async () => {
    const id = (await post(igor, validEvent())).body.id as string;
    const [refused, refusedSilently, other] = await Promise.all([
      account('user'),
      account('user'),
      account('user'),
    ]);
    const decided = (userId: string, status: 'rejected' | 'confirmed', reason: string | null) =>
      prisma.participation.create({
        data: {
          eventId: id,
          userId,
          status,
          decisionReason: reason,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    await decided(refused.id, 'rejected', 'Группа уже набрана');
    await decided(refusedSilently.id, 'rejected', null);
    // Причина у принятой записи не показывается, даже если в базе она есть
    await decided(other.id, 'confirmed', 'Ждём в 18:30');

    const reason = async (who: Account | null) => (await get(who, id)).body.participationReason;
    expect(await reason(refused)).toBe('Группа уже набрана');
    expect(await reason(refusedSilently)).toBeNull();
    expect(await reason(other)).toBeNull();
    // Чужая отклонённая заявка: ни другому пользователю, ни организатору, ни администратору, ни гостю
    for (const who of [anna, igor, admin, orgApproved, null]) {
      expect(await reason(who)).toBeNull();
    }
  });

  it('карточка, лента, /me и ответы с ошибкой не кешируются', async () => {
    expect((await get(anna, eventId)).headers['cache-control']).toBe('no-store');
    expect((await get(null, eventId)).headers['cache-control']).toBe('no-store');
    const me = await http().get('/me').set('Cookie', anna.cookie);
    expect(me.status).toBe(200);
    expect(me.headers['cache-control']).toBe('no-store');
    const feed = await http().get('/events');
    expect(feed.status).toBe(200);
    expect(feed.headers['cache-control']).toBe('no-store');
    const missing = await get(anna, randomUUID());
    expect(missing.status).toBe(404);
    expect(missing.headers['cache-control']).toBe('no-store');
  });

  it('главная кнопка по статусу записи: «Отменить запись» или «Записаться»', async () => {
    const id = (await post(igor, validEvent())).body.id as string;
    const expected = {
      pending: { code: 'leave', enabled: true },
      confirmed: { code: 'leave', enabled: true },
      waitlist: { code: 'leave', enabled: true },
      cancelled: { code: 'join', enabled: true },
      rejected: { code: 'join', enabled: false, reason: expect.stringMatching(/После отказа/) },
    } as const;
    for (const [status, action] of Object.entries(expected)) {
      const viewer = await account('user');
      await participation(id, viewer.id, status as keyof typeof expected);
      const response = await get(viewer, id);
      expect(response.status, status).toBe(200);
      const codes = (response.body.actions as { code: string }[]).map((item) => item.code);
      expect(response.body.actions[0], status).toEqual(action);
      expect(
        codes.filter((code) => code === 'join' || code === 'leave'),
        status,
      ).toHaveLength(1);
    }
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
    expect(response.body.sport).toMatchObject({ name: 'Другое', category: 'other' });
  });

  it.each(['не-uuid', randomUUID()])('несуществующее мероприятие (%s) — 404', async (id) => {
    const response = await get(anna, id);
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('event_not_available');
  });
});
