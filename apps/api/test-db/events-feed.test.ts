import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { REAL_TIME } from '../src/core/clock';
import { STAND_CONFIG } from '../src/core/config';
import type { Prisma } from '../src/generated/prisma/client';
import { createUser, databaseUrl, participation, prisma } from './db';

// Среда, 21 октября 2026, 10:00 по Красноярску
const NOW = '2026-10-21T03:00:00Z';
const tag = randomUUID().slice(0, 8);
// Город-метка: база общая с другими тестами, лента этого файла видит только свои события
const city = `Тестоград ${tag}`;

let app: INestApplication;
let organizerId: string;
let orgId: string;
const sports: Record<'football' | 'chess' | 'hidden', string> = {
  football: '',
  chess: '',
  hidden: '',
};

const krat = (local: string) => new Date(`${local}+07:00`);

async function event(
  title: string,
  starts: string,
  ends: string,
  extra: Partial<Prisma.EventUncheckedCreateInput> = {},
) {
  const created = await prisma.event.create({
    data: {
      organizerUserId: extra.organizerOrgId ? null : organizerId,
      sportId: sports.football,
      title,
      description: `Описание: ${title}`,
      startsAt: krat(starts),
      endsAt: krat(ends),
      city,
      area: 'Центральный',
      placeText: 'Где-то',
      statusChangedAt: new Date(NOW),
      createdAt: new Date(NOW),
      ...extra,
    },
  });
  return created.id;
}

const feed = (query: Record<string, string | number> = {}) =>
  request(app.getHttpServer())
    .get('/events')
    .query({ city, ...query });

const titles = async (query: Record<string, string | number> = {}) => {
  const response = await feed(query);
  expect(response.status).toBe(200);
  return (response.body.items as { title: string }[]).map((item) => item.title);
};

beforeAll(async () => {
  process.env.DATABASE_URL = databaseUrl;
  process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef';
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(STAND_CONFIG)
    .useValue({ demoMode: false, standId: null })
    .overrideProvider(REAL_TIME)
    .useValue(() => Date.parse(NOW))
    .compile();
  app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();

  organizerId = (await createUser()).id;
  const owner = await createUser();
  orgId = (
    await prisma.organization.create({
      data: {
        ownerUserId: owner.id,
        name: 'Шахматный клуб «Ладья»',
        description: 'Клуб',
        city: 'Красноярск',
        contacts: '—',
        representativeName: 'Иван',
        representativeRole: 'Тренер',
        status: 'approved',
      },
    })
  ).id;
  const sport = (name: string, data: Partial<Prisma.SportCreateInput> = {}) =>
    prisma.sport.create({
      data: { name: `${name} ${tag}`, normalizedName: `${name.toLowerCase()} ${tag}`, ...data },
    });
  sports.football = (await sport('Футбол', { category: 'team', aliases: [`соккер ${tag}`] })).id;
  sports.chess = (await sport('Шахматы', { category: 'intellectual' })).id;
  sports.hidden = (await sport('Неприличное', { category: 'team', status: 'hidden' })).id;

  // Сегодня, завтра, выходные — по Красноярску
  await event('Футбол сегодня вечером', '2026-10-21T18:00', '2026-10-21T20:00', {
    level: 'amateur',
  });
  await event('Футбол сегодня ночью', '2026-10-21T23:30', '2026-10-21T23:59', { level: 'any' });
  // 00:30 четверга в Красноярске — это ещё 21-е по UTC
  await event('Пробежка в полночь', '2026-10-22T00:30', '2026-10-22T01:30', { level: 'beginner' });
  await event('Блиц в субботу', '2026-10-24T12:00', '2026-10-24T15:00', {
    sportId: sports.chess,
    organizerOrgId: orgId,
    mode: 'approval',
    level: 'advanced',
  });
  // Идёт сейчас — в ленте; завершилось — нет
  await event('Зарядка идёт', '2026-10-21T09:00', '2026-10-21T11:00');
  await event('Йога вчера', '2026-10-20T06:00', '2026-10-20T07:00');
  // Недоступные
  await event('Отменено', '2026-10-21T19:00', '2026-10-21T20:00', { status: 'cancelled' });
  await event('Снято', '2026-10-21T19:00', '2026-10-21T20:00', { status: 'unpublished' });
  await event('Удалено', '2026-10-21T19:00', '2026-10-21T20:00', { status: 'deleted' });
  // Скрытое направление
  await event('Игра со скрытым направлением', '2026-10-23T18:00', '2026-10-23T19:00', {
    sportId: sports.hidden,
  });
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('GET /events — что попадает в ленту', () => {
  it('только опубликованные и не завершённые, по дате начала', async () => {
    expect(await titles()).toEqual([
      'Зарядка идёт',
      'Футбол сегодня вечером',
      'Футбол сегодня ночью',
      'Пробежка в полночь',
      'Игра со скрытым направлением',
      'Блиц в субботу',
    ]);
  });

  it('открыта гостю; строка ленты — без лишних полей, организатор и статус', async () => {
    const response = await feed({ limit: 1 });
    expect(Object.keys(response.body.items[0]).sort()).toEqual(
      [
        'area',
        'city',
        'displayStatus',
        'endsAt',
        'id',
        'level',
        'mode',
        'organizer',
        'sport',
        'startsAt',
        'title',
      ].sort(),
    );
    expect(response.body.items[0]).toMatchObject({
      title: 'Зарядка идёт',
      displayStatus: 'ongoing',
      organizer: { kind: 'user', id: organizerId },
    });
  });

  it('счётчик мест учитывается в статусе', async () => {
    // Свой город: остальные тесты файла не должны видеть это мероприятие
    const ownCity = `${city} места`;
    const id = await event('Мини-футбол на двоих', '2026-10-25T10:00', '2026-10-25T11:00', {
      capacity: 1,
      city: ownCity,
    });
    await participation(id, (await createUser()).id, 'confirmed');
    const response = await feed({ city: ownCity });
    expect(response.body.items).toEqual([expect.objectContaining({ id, displayStatus: 'full' })]);
  });
});

describe('GET /events — фильтры', () => {
  it.each([
    ['today', ['Зарядка идёт', 'Футбол сегодня вечером', 'Футбол сегодня ночью']],
    ['tomorrow', ['Пробежка в полночь']],
    ['weekend', ['Блиц в субботу']],
  ])('дата %s — по Красноярску, граница суток в UTC+7', async (date, expected) => {
    expect(await titles({ date })).toEqual(expected);
  });

  it('ровно полночь по Красноярску — уже следующие сутки; кончилось ровно сейчас — не в ленте', async () => {
    const ownCity = `${city} граница`;
    const boundary = { city: ownCity };
    await event('Ровно в полночь', '2026-10-22T00:00', '2026-10-22T00:30', boundary);
    await event('Кончилось ровно сейчас', '2026-10-21T09:00', '2026-10-21T10:00', boundary);
    expect(await titles({ city: ownCity, date: 'tomorrow' })).toEqual(['Ровно в полночь']);
    expect(await titles({ city: ownCity, date: 'today' })).toEqual([]);
    expect(await titles({ city: ownCity })).toEqual(['Ровно в полночь']);
    // Город — без учёта регистра
    expect(await titles({ city: ownCity.toUpperCase() })).toEqual(['Ровно в полночь']);
  });

  it('% и _ в тексте, городе и районе — обычные символы, а не шаблон', async () => {
    expect(await titles({ q: '%' })).toEqual([]);
    expect(await titles({ q: '_' })).toEqual([]);
    expect(await titles({ q: 'Ф%бол' })).toEqual([]);
    expect(await titles({ area: '%' })).toEqual([]);
    expect((await feed({ city: '%' })).body.items).toEqual([]);
    expect((await feed({ city: city.replace(' ', '_') })).body.items).toEqual([]);
  });

  it('диапазон дат включает обе границы', async () => {
    expect(await titles({ from: '2026-10-22', to: '2026-10-23' })).toEqual([
      'Пробежка в полночь',
      'Игра со скрытым направлением',
    ]);
    expect(await titles({ from: '2026-10-24' })).toEqual(['Блиц в субботу']);
  });

  it('текст: название, описание, направление и его алиас', async () => {
    expect(await titles({ q: 'блиц' })).toEqual(['Блиц в субботу']);
    expect(await titles({ q: 'Описание: Пробежка' })).toEqual(['Пробежка в полночь']);
    expect(await titles({ q: `шахматы ${tag}` })).toEqual(['Блиц в субботу']);
    expect(await titles({ q: `Соккер ${tag}` })).toEqual([
      'Зарядка идёт',
      'Футбол сегодня вечером',
      'Футбол сегодня ночью',
      'Пробежка в полночь',
    ]);
  });

  it('скрытое направление: не ищется по названию, в карточке — «Другое», в группе «Другое»', async () => {
    expect(await titles({ q: `неприличное ${tag}` })).toEqual([]);
    expect(await titles({ category: 'other' })).toEqual(['Игра со скрытым направлением']);
    expect(await titles({ category: 'team' })).not.toContain('Игра со скрытым направлением');
    const response = await feed({ category: 'other' });
    expect(response.body.items[0].sport).toMatchObject({ name: 'Другое', category: 'other' });
  });

  it('направление и группа', async () => {
    expect(await titles({ sport: sports.chess })).toEqual(['Блиц в субботу']);
    expect(await titles({ category: 'intellectual' })).toEqual(['Блиц в субботу']);
  });

  it('уровень: выбранный и «Любой»', async () => {
    expect(await titles({ level: 'beginner' })).toEqual([
      'Зарядка идёт',
      'Футбол сегодня ночью',
      'Пробежка в полночь',
      'Игра со скрытым направлением',
    ]);
    expect(await titles({ level: 'advanced' })).toEqual([
      'Зарядка идёт',
      'Футбол сегодня ночью',
      'Игра со скрытым направлением',
      'Блиц в субботу',
    ]);
  });

  it('режим, район и организация-организатор', async () => {
    const response = await feed({ mode: 'approval' });
    expect(response.body.items).toEqual([
      expect.objectContaining({
        title: 'Блиц в субботу',
        organizer: { kind: 'organization', id: orgId, name: 'Шахматный клуб «Ладья»' },
      }),
    ]);
    expect(await titles({ area: 'центральный', date: 'tomorrow' })).toEqual(['Пробежка в полночь']);
    expect(await titles({ area: 'Октябрьский' })).toEqual([]);
  });
});

describe('GET /events — пагинация и ошибки', () => {
  it('страницы не перекрываются, total — по всем подходящим', async () => {
    const all = await titles({ limit: 50 });
    const first = await feed({ limit: 2 });
    const second = await feed({ limit: 2, offset: 2 });
    expect(first.body).toMatchObject({ total: all.length, limit: 2, offset: 0 });
    const paged = [...first.body.items, ...second.body.items].map(
      (item: { title: string }) => item.title,
    );
    expect(paged).toEqual(all.slice(0, 4));
  });

  it.each([
    ['быстрая дата и диапазон вместе', { date: 'today', from: '2026-10-21' }, 'date'],
    ['несуществующая дата', { from: '2030-02-30' }, 'from'],
    ['«по» раньше «с»', { from: '2026-10-23', to: '2026-10-22' }, 'to'],
    ['дата в другом формате', { from: '21.10.2026' }, 'from'],
    ['неизвестная быстрая дата', { date: 'yesterday' }, 'date'],
    ['лимит 0', { limit: 0 }, 'limit'],
    ['лимит больше 50', { limit: 51 }, 'limit'],
    ['неизвестная группа', { category: 'mind' }, 'category'],
    ['направление не UUID', { sport: 'футбол' }, 'sport'],
  ])('%s — 400 с полем', async (_, query, field) => {
    const response = await feed(query);
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('validation_failed');
    expect(response.body.fields).toHaveProperty(field);
  });
});
