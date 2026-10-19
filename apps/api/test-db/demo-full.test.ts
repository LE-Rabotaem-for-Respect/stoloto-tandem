import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { REAL_TIME } from '../src/core/clock';
import { STAND_CONFIG } from '../src/core/config';
import { RESET_TABLES } from '../src/modules/demo';
import { verifyPassword } from '../src/modules/auth/password';
import { dayAt, nearestWeekdayAt } from '../src/modules/demo/relative-dates';
import { databaseUrl, prisma } from './db';

// Понедельник, 12:00 по Красноярску
const now = new Date('2026-10-19T12:00:00+07:00');

let app: INestApplication;
// Часы стенда в тесте: сброс можно проверить в любой момент недели
let current = now;

async function reset() {
  const response = await request(app.getHttpServer()).post('/demo/reset');
  expect(response.status).toBe(200);
}

const eventByTitle = (title: string) =>
  prisma.event.findFirstOrThrow({
    where: { title },
    include: {
      participations: { include: { user: true }, orderBy: { createdAt: 'asc' } },
      organizerUser: true,
      organizerOrg: true,
      sport: true,
    },
  });

const names = (rows: { user: { name: string } }[]) => rows.map((row) => row.user.name);

beforeAll(async () => {
  process.env.DATABASE_URL = databaseUrl;
  process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef';
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(STAND_CONFIG)
    .useValue({ demoMode: true, standId: 'stand-1' })
    .overrideProvider(REAL_TIME)
    .useValue(() => current.getTime())
    .compile();
  app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();
  await reset();
});

afterAll(async () => {
  await app.close();
  // База общая для всех файлов тестов: убрать демо-данные (в них занятые адреса @demo)
  // и вернуть строку настроек стенда, как после миграций
  await prisma.$executeRawUnsafe(
    `TRUNCATE ${RESET_TABLES.map((t) => `"${t}"`).join(', ')} CASCADE`,
  );
  await prisma.appState.update({
    where: { id: true },
    data: { clockOffsetSeconds: 0, lastResetAt: null },
  });
  await prisma.$disconnect();
});

describe('полный сид после «Сбросить демо-данные»', () => {
  it('18 человек: демо-аккаунты и фоновые участники с почтой по имени', async () => {
    expect(await prisma.user.count()).toBe(18);
    const ksenia = await prisma.user.findUniqueOrThrow({ where: { email: 'ksenia@demo' } });
    expect(ksenia).toMatchObject({ name: 'Ксения', role: 'user' });
    expect(await verifyPassword('demo', ksenia.passwordHash)).toBe(true);
  });

  it('10 мероприятий, даты — от Clock по календарю Красноярска', async () => {
    expect(await prisma.event.count()).toBe(10);
    const football = await eventByTitle('Футбол 7×7 по средам');
    expect(football.startsAt).toEqual(nearestWeekdayAt(now, [3], '19:00'));
    expect(football.endsAt).toEqual(dayAt(football.startsAt, 0, '20:30'));
    const run = await eventByTitle('Пробежка 5 км на острове Татышев');
    expect(run.startsAt).toEqual(dayAt(now, 2, '08:00'));
    const yoga = await eventByTitle('Йога на рассвете');
    expect(yoga.endsAt.getTime()).toBeLessThan(now.getTime());
    expect(yoga.startsAt).toEqual(dayAt(now, -12, '05:30'));
  });

  it('«Футбол»: 8 участников и 3 заявки с ответами, решение принимал Игорь', async () => {
    const football = await eventByTitle('Футбол 7×7 по средам');
    expect(football.organizerUser?.email).toBe('igor@demo');
    expect(football).toMatchObject({ mode: 'approval', capacity: 14, price: 300 });
    const confirmed = football.participations.filter((p) => p.status === 'confirmed');
    const pending = football.participations.filter((p) => p.status === 'pending');
    expect(confirmed).toHaveLength(8);
    expect(confirmed.every((p) => p.decidedById === football.organizerUserId)).toBe(true);
    expect(pending.map((p) => `${p.user.name}: ${p.answer}`)).toEqual([
      'Дмитрий: Защитник',
      'Сергей: Вратарь',
      'Артём: Где нужно',
    ]);
    expect(football.participantInfo).toBe(
      'Поле с искусственным газоном, раздевалка открыта с 18:30',
    );
  });

  it('«Пробежка» заполнена: 6 из 6, листа ожидания нет', async () => {
    const run = await eventByTitle('Пробежка 5 км на острове Татышев');
    expect(run.capacity).toBe(6);
    expect(run.participations.map((p) => p.status)).toEqual(Array(6).fill('confirmed'));
  });

  it('мероприятия «Ладьи» — от имени организации', async () => {
    const blitz = await eventByTitle('Блиц-турнир в клубе «Ладья»');
    expect(blitz.organizerUserId).toBeNull();
    expect(blitz.organizerOrg?.name).toBe('Шахматный клуб «Ладья»');
    expect(names(blitz.participations)).toEqual(['Мария', 'Павел']);
  });

  it('«Волейбол» снят модератором с причиной и записью в журнале', async () => {
    const volleyball = await eventByTitle('Волейбол на песке');
    expect(volleyball).toMatchObject({
      status: 'unpublished',
      statusReason: 'Площадка закрыта на ремонт',
    });
    expect(names(volleyball.participations)).toEqual(['Анна', 'Кирилл']);
    const log = await prisma.moderationLog.findFirstOrThrow({
      where: { objectId: volleyball.id },
      include: { actor: true },
    });
    expect(log).toMatchObject({ objectType: 'event', reason: 'Площадка закрыта на ремонт' });
    expect(log.actor.email).toBe('admin@demo');
    const published = await prisma.event.count({ where: { status: 'published' } });
    expect(published).toBe(9);
  });

  it('«Петанк» — пользовательское направление Сергея', async () => {
    const petanque = await eventByTitle('Петанк на набережной');
    expect(petanque.sport).toMatchObject({ name: 'Петанк', isCustom: true, category: 'other' });
    const sergey = await prisma.user.findUniqueOrThrow({ where: { email: 'sergey@demo' } });
    expect(petanque.sport.createdById).toBe(sergey.id);
    const sports = await prisma.event.findMany({
      select: { sportId: true },
      distinct: ['sportId'],
    });
    expect(sports).toHaveLength(9);
  });

  it('обсуждения: вопрос и ответ организатора, у «Ладьи» — от имени организации', async () => {
    const blitz = await eventByTitle('Блиц-турнир в клубе «Ладья»');
    const messages = await prisma.message.findMany({
      where: { eventId: blitz.id },
      include: { author: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(messages.map((m) => m.text)).toEqual([
      'Часы и доски свои приносить?',
      'Всё есть в клубе',
    ]);
    const [question, answer] = messages;
    expect(question?.author.email).toBe('pavel@demo');
    expect(answer).toMatchObject({
      parentId: question?.id,
      asOrganizationId: blitz.organizerOrgId,
    });
    expect(answer?.author.email).toBe('ladya@demo');
    expect(await prisma.message.count()).toBe(6);
    expect(await prisma.message.count({ where: { isFaq: true } })).toBe(0);
  });

  it('ни одна отметка времени не позже Clock.now()', async () => {
    const [users, organizations, events, participations, messages, log] = await Promise.all([
      prisma.user.findMany({ select: { createdAt: true } }),
      prisma.organization.findMany({ select: { submittedAt: true, decidedAt: true } }),
      prisma.event.findMany({ select: { createdAt: true, statusChangedAt: true } }),
      prisma.participation.findMany({
        select: { createdAt: true, updatedAt: true, decidedAt: true },
      }),
      prisma.message.findMany({ select: { createdAt: true } }),
      prisma.moderationLog.findMany({ select: { createdAt: true } }),
    ]);
    const stamps = [
      ...users.map((u) => u.createdAt),
      ...organizations.flatMap((o) => [o.submittedAt, o.decidedAt]),
      ...events.flatMap((e) => [e.createdAt, e.statusChangedAt]),
      ...participations.flatMap((p) => [p.createdAt, p.updatedAt, p.decidedAt]),
      ...messages.map((m) => m.createdAt),
      ...log.map((entry) => entry.createdAt),
    ].filter((stamp): stamp is Date => stamp !== null);
    expect(stamps.every((stamp) => stamp.getTime() <= now.getTime())).toBe(true);
  });

  it('повторный сброс возвращает ровно то же состояние', async () => {
    const state = async () =>
      prisma.event.findMany({
        select: {
          title: true,
          startsAt: true,
          status: true,
          participations: {
            select: { status: true, answer: true, user: { select: { email: true } } },
            orderBy: { createdAt: 'asc' },
          },
          messages: { select: { text: true }, orderBy: { createdAt: 'asc' } },
        },
        orderBy: { title: 'asc' },
      });
    const before = await state();
    const anna = await prisma.user.findUniqueOrThrow({ where: { email: 'anna@demo' } });
    const climbing = await eventByTitle('Скалолазание для начинающих');
    await prisma.participation.create({
      data: {
        eventId: climbing.id,
        userId: anna.id,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      },
    });
    await reset();
    expect(await state()).toEqual(before);
  });
});

describe('сброс в любой момент недели', () => {
  // Окна, где до начала меньше 3 часов, а до окончания больше: раньше сброс здесь падал
  it.each([
    '2026-10-21T17:00:00+07:00',
    '2026-10-24T10:00:00+07:00',
    '2026-10-25T09:00:00+07:00',
    '2026-10-20T04:45:00+07:00',
  ])('сброс %s проходит, мероприятия кончаются в тот же день', async (moment) => {
    current = new Date(moment);
    await reset();
    const events = await prisma.event.findMany();
    expect(events).toHaveLength(10);
    for (const event of events) {
      expect(event.endsAt.getTime(), event.title).toBeGreaterThan(event.startsAt.getTime());
      expect(dayAt(event.endsAt, 0, '00:00'), event.title).toEqual(
        dayAt(event.startsAt, 0, '00:00'),
      );
    }
    const football = events.find((event) => event.title === 'Футбол 7×7 по средам');
    expect(football?.startsAt).toEqual(nearestWeekdayAt(current, [3], '19:00'));
  });
});
