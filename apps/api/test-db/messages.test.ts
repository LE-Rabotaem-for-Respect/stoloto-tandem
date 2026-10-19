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
import type { Prisma } from '../src/generated/prisma/client';
import { hashPassword } from '../src/modules/auth/password';
import { databaseUrl, participation, prisma } from './db';

const COOKIE = 'tandem_session';
const PASSWORD = 'пароль-1234';
const DAY = 86_400_000;
const inDays = (days: number, hours = 0) => new Date(Date.now() + days * DAY + hours * 3_600_000);

let app: INestApplication;
let passwordHash: string;
let sportId: string;
const http = () => request(app.getHttpServer());

async function account(role: 'user' | 'admin' | 'org', orgStatus: OrganizationStatus = 'approved') {
  const email = `${role}-${randomUUID()}@example.ru`;
  const user = await prisma.user.create({
    data: { name: `Аккаунт ${role}`, email, passwordHash, role, createdAt: new Date() },
  });
  const organization =
    role === 'org'
      ? await prisma.organization.create({
          data: {
            ownerUserId: user.id,
            name: `Клуб ${randomUUID().slice(0, 6)}`,
            description: 'Описание',
            city: 'Красноярск',
            contacts: '+7 900 000-00-00',
            representativeName: 'Иван Петров',
            representativeRole: 'Тренер',
            status: orgStatus,
          },
        })
      : null;
  const login = await http().post('/auth/login').send({ email, password: PASSWORD });
  if (login.status !== 200) throw new Error(`Вход не удался: ${login.status}`);
  const header = login.headers['set-cookie'] as unknown as string[];
  const cookie = header.find((line) => line.startsWith(`${COOKIE}=`))?.split(';')[0] ?? '';
  return { id: user.id, cookie, organization };
}

type Account = Awaited<ReturnType<typeof account>>;

let organizer: Account;
let anna: Account;
let igor: Account;
let admin: Account;
let org: Account;
let orgPending: Account;

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

const as = (who: Account | null, req: request.Test) => (who ? req.set('Cookie', who.cookie) : req);
const list = (who: Account | null, eventId: string) =>
  as(who, http().get(`/events/${eventId}/messages`));
const post = (who: Account | null, eventId: string, body: object) =>
  as(who, http().post(`/events/${eventId}/messages`)).send(body);
const edit = (who: Account, eventId: string, messageId: string, body: object) =>
  as(who, http().patch(`/events/${eventId}/messages/${messageId}`)).send(body);
const remove = (who: Account, eventId: string, messageId: string) =>
  as(who, http().delete(`/events/${eventId}/messages/${messageId}`));

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
      data: { name: `Шахматы ${tag}`, normalizedName: `шахматы ${tag}`, category: 'intellectual' },
    })
  ).id;
  [organizer, anna, igor, admin, org, orgPending] = await Promise.all([
    account('user'),
    account('user'),
    account('user'),
    account('admin'),
    account('org'),
    account('org', 'pending'),
  ]);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('POST /events/:id/messages', () => {
  it('вопрос задаёт и не записавшийся пользователь; в шину — MessagePosted', async () => {
    const event = await createEvent();
    const published = vi.spyOn(app.get(EventBus), 'publish');
    const response = await post(anna, event.id, { text: '  Можно прийти с ребёнком?  ' });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      parentId: null,
      author: { kind: 'user', id: anna.id, name: 'Аккаунт user' },
      isOrganizer: false,
      text: 'Можно прийти с ребёнком?',
      placeholder: null,
      status: 'visible',
      edited: false,
      editedAt: null,
    });
    // Строго: без почты и других полей аккаунта
    expect(response.body.author).toEqual({ kind: 'user', id: anna.id, name: 'Аккаунт user' });
    expect(published).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'MessagePosted',
        messageId: response.body.id,
        eventId: event.id,
        authorId: anna.id,
      }),
    );
    published.mockRestore();
  });

  it('гостю — 401, администратору и недопущенной организации — отказ', async () => {
    const event = await createEvent();
    expect((await post(null, event.id, { text: 'Привет' })).status).toBe(401);
    const byAdmin = await post(admin, event.id, { text: 'Привет' });
    expect(byAdmin.status).toBe(403);
    expect(byAdmin.body.code).toBe('forbidden');
    const pending = await post(orgPending, event.id, { text: 'Привет' });
    expect(pending.status).toBe(403);
    expect(pending.body.code).toBe('organization_not_approved');
    expect(await prisma.message.count({ where: { eventId: event.id } })).toBe(0);
  });

  it('допущенная организация подписывает сообщение названием; у организатора — метка', async () => {
    const { organization } = org;
    if (!organization) throw new Error('У аккаунта организации нет организации');
    const event = await createEvent({ organizerUserId: null, organizerOrgId: organization.id });
    const response = await post(org, event.id, { text: 'Встречаемся у входа' });
    expect(response.status).toBe(201);
    expect(response.body.author).toEqual({
      kind: 'organization',
      id: organization.id,
      name: organization.name,
    });
    expect(response.body.isOrganizer).toBe(true);
  });

  it('ответ — только на видимое сообщение верхнего уровня этого обсуждения', async () => {
    const event = await createEvent();
    const other = await createEvent();
    const question = (await post(anna, event.id, { text: 'Во сколько сбор?' })).body;
    const answer = await post(organizer, event.id, { text: 'В 18:45', parentId: question.id });
    expect(answer.status).toBe(201);
    expect(answer.body).toMatchObject({ parentId: question.id, isOrganizer: true });

    const nested = await post(igor, event.id, { text: 'Спасибо', parentId: answer.body.id });
    expect(nested.status).toBe(400);
    expect(nested.body.fields).toEqual({
      parentId: 'Ответить можно только на сообщение верхнего уровня',
    });
    const foreign = await post(igor, other.id, { text: 'Спасибо', parentId: question.id });
    expect(foreign.status).toBe(400);
    expect(Object.keys(foreign.body.fields)).toEqual(['parentId']);

    await remove(anna, event.id, question.id);
    const toDeleted = await post(igor, event.id, { text: 'А я?', parentId: question.id });
    expect(toDeleted.status).toBe(400);
    expect(Object.keys(toDeleted.body.fields)).toEqual(['parentId']);
  });

  it.each([
    ['пустое', '   '],
    ['длиннее 2000 символов', 'а'.repeat(2001)],
    ['с переворотом текста U+202E', 'Привет‮'],
  ])('%s сообщение — ошибка поля', async (_, text) => {
    const event = await createEvent();
    const response = await post(anna, event.id, { text });
    expect(response.status).toBe(400);
    expect(Object.keys(response.body.fields)).toEqual(['text']);
  });

  it('в снятом с публикации — записавшийся видит, но писать нельзя никому', async () => {
    const event = await createEvent({ status: 'unpublished', statusReason: 'Проверка' });
    await participation(event.id, anna.id, 'confirmed');
    const participant = await post(anna, event.id, { text: 'Что случилось?' });
    expect(participant.status).toBe(404);
    expect(participant.body.code).toBe('event_not_available');
    const stranger = await post(igor, event.id, { text: 'Что случилось?' });
    expect(stranger.status).toBe(404);
    expect(await prisma.message.count({ where: { eventId: event.id } })).toBe(0);
  });
});

describe('GET /events/:id/messages', () => {
  it('гость читает обсуждение: вопросы по времени, ответы внутри, метка организатора', async () => {
    const event = await createEvent();
    const first = (await post(anna, event.id, { text: 'Первый вопрос' })).body;
    const second = (await post(igor, event.id, { text: 'Второй вопрос' })).body;
    await post(organizer, event.id, { text: 'Ответ на первый', parentId: first.id });

    const response = await list(null, event.id);
    expect(response.status).toBe(200);
    expect(response.body.map((m: { id: string }) => m.id)).toEqual([first.id, second.id]);
    expect(response.body[0].replies).toHaveLength(1);
    expect(response.body[0].replies[0]).toMatchObject({
      text: 'Ответ на первый',
      isOrganizer: true,
      parentId: first.id,
    });
    expect(response.body[1].replies).toEqual([]);
    // Гостю действий над сообщениями нет
    expect(response.body[0].actions).toEqual([]);
  });

  it('автор видит у своего сообщения «Изменить» и «Удалить», другие — нет', async () => {
    const event = await createEvent();
    await post(anna, event.id, { text: 'Мой вопрос' });
    const own = (await list(anna, event.id)).body[0];
    expect(own.actions).toEqual([
      { code: 'edit_message', enabled: true },
      { code: 'delete_message', enabled: true },
    ]);
    expect((await list(igor, event.id)).body[0].actions).toEqual([]);
  });

  it('снятое мероприятие: постороннему и гостю — «Мероприятие недоступно», записавшемуся — видно', async () => {
    const event = await createEvent({ status: 'unpublished', statusReason: 'Проверка' });
    await participation(event.id, anna.id, 'pending');
    for (const who of [null, igor]) {
      const response = await list(who, event.id);
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('event_not_available');
    }
    expect((await list(anna, event.id)).status).toBe(200);
  });

  it('несуществующее мероприятие и неверный id — «Мероприятие недоступно»', async () => {
    for (const id of [randomUUID(), 'not-a-uuid']) {
      const response = await list(null, id);
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('event_not_available');
    }
  });

  it('скрытое модератором: заглушка всем, причину видит только автор', async () => {
    const event = await createEvent();
    const message = (await post(anna, event.id, { text: 'Ссылка на казино' })).body;
    await prisma.message.update({
      where: { id: message.id },
      data: { status: 'hidden_by_moderator', moderationReason: 'Реклама' },
    });
    const forGuest = (await list(null, event.id)).body[0];
    expect(forGuest).toMatchObject({
      text: null,
      placeholder: 'Скрыто модератором',
      status: 'hidden_by_moderator',
      moderationReason: null,
    });
    const forAuthor = (await list(anna, event.id)).body[0];
    expect(forAuthor).toMatchObject({ text: null, moderationReason: 'Реклама', actions: [] });
  });
});

describe('PATCH и DELETE своего сообщения', () => {
  it('правка: новый текст и признак «изменено»', async () => {
    const event = await createEvent();
    const message = (await post(anna, event.id, { text: 'Во сколко сбор?' })).body;
    const response = await edit(anna, event.id, message.id, { text: 'Во сколько сбор?' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ text: 'Во сколько сбор?', edited: true });
    expect(response.body.editedAt).not.toBeNull();
    const listed = (await list(null, event.id)).body[0];
    expect(listed).toMatchObject({ text: 'Во сколько сбор?', edited: true });
  });

  it('чужое сообщение — «только автор», организатор и администратор тоже не правят', async () => {
    const event = await createEvent();
    const message = (await post(anna, event.id, { text: 'Вопрос' })).body;
    for (const who of [igor, organizer, admin]) {
      const changed = await edit(who, event.id, message.id, { text: 'Подмена' });
      expect(changed.status).toBe(403);
      expect(changed.body.code).toBe('not_message_author');
      const deleted = await remove(who, event.id, message.id);
      expect(deleted.status).toBe(403);
    }
    const stored = await prisma.message.findUniqueOrThrow({ where: { id: message.id } });
    expect(stored).toMatchObject({ text: 'Вопрос', status: 'visible', editedAt: null });
  });

  it('удаление автором: заглушка, ответы сохраняются; в шину — MessageDeleted', async () => {
    const event = await createEvent();
    const question = (await post(anna, event.id, { text: 'Вопрос' })).body;
    await post(organizer, event.id, { text: 'Ответ', parentId: question.id });
    const published = vi.spyOn(app.get(EventBus), 'publish');
    const response = await remove(anna, event.id, question.id);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      text: null,
      placeholder: 'Сообщение удалено автором',
      status: 'deleted_by_author',
      actions: [],
    });
    expect(published).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'MessageDeleted', messageId: question.id, by: 'author' }),
    );
    published.mockRestore();

    const thread = (await list(null, event.id)).body[0];
    expect(thread).toMatchObject({ id: question.id, text: null, status: 'deleted_by_author' });
    expect(thread.replies.map((reply: { text: string }) => reply.text)).toEqual(['Ответ']);
  });

  it('удалённое и скрытое не правится и не удаляется повторно', async () => {
    const event = await createEvent();
    const message = (await post(anna, event.id, { text: 'Вопрос' })).body;
    await remove(anna, event.id, message.id);
    const again = await remove(anna, event.id, message.id);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('invalid_transition');
    const changed = await edit(anna, event.id, message.id, { text: 'Новый текст' });
    expect(changed.status).toBe(409);
    expect(changed.body.code).toBe('invalid_transition');
  });

  it('сообщение другого обсуждения и несуществующее — «Не найдено»', async () => {
    const event = await createEvent();
    const other = await createEvent();
    const message = (await post(anna, other.id, { text: 'Вопрос' })).body;
    for (const id of [message.id, randomUUID(), 'not-a-uuid']) {
      const response = await edit(anna, event.id, id, { text: 'Текст' });
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('not_found');
    }
  });

  it('в снятом мероприятии автор своё не правит (ТЗ 2.10)', async () => {
    const event = await createEvent();
    await participation(event.id, anna.id, 'confirmed');
    const message = (await post(anna, event.id, { text: 'Вопрос' })).body;
    await prisma.event.update({
      where: { id: event.id },
      data: { status: 'unpublished', statusReason: 'Проверка' },
    });
    const response = await edit(anna, event.id, message.id, { text: 'Новый текст' });
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('event_not_available');
  });
});
