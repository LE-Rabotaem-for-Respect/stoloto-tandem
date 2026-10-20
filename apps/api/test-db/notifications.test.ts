import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { EventBus, domainEvent } from '../src/core/event-bus';
import { NotificationHandlers } from '../src/modules/notifications/notifications.handlers';
import {
  createOrganization,
  createSport,
  createUser,
  databaseUrl,
  eventData,
  participation,
  prisma,
} from './db';

const at = new Date('2026-10-19T12:00:00Z');
const meta = (actorId: string | null) => ({ actorId, occurredAt: at });

let app: INestApplication;
let handlers: NotificationHandlers;

beforeAll(async () => {
  process.env.DATABASE_URL = databaseUrl;
  process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef';
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = configureApp(moduleRef.createNestApplication());
  await app.init();
  handlers = app.get(NotificationHandlers);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

async function eventByUser() {
  const [organizer, sport] = await Promise.all([createUser(), createSport()]);
  const event = await prisma.event.create({
    data: { ...eventData(sport.id), title: 'Футбол в среду', organizerUserId: organizer.id },
  });
  return { organizer, event };
}

const notificationsOf = (userId: string) =>
  prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });

describe('кто получает уведомления (ТЗ 3.3)', () => {
  it('новая заявка — организатору', async () => {
    const { organizer, event } = await eventByUser();
    const anna = await createUser();
    const p = await participation(event.id, anna.id, 'pending');

    await handlers.requested(
      domainEvent('ParticipationRequested', {
        participationId: p.id,
        eventId: event.id,
        userId: anna.id,
        ...meta(anna.id),
      }),
    );

    const [notification] = await notificationsOf(organizer.id);
    expect(notification).toMatchObject({
      type: 'participation_requested',
      payload: { eventTitle: 'Футбол в среду' },
      link: `/events/${event.id}`,
      readAt: null,
    });
    expect(await notificationsOf(anna.id)).toHaveLength(0);
  });

  it('у мероприятия организации — представителю организации', async () => {
    const organization = await createOrganization();
    const sport = await createSport();
    const event = await prisma.event.create({
      data: { ...eventData(sport.id), organizerOrgId: organization.id },
    });
    const anna = await createUser();
    const p = await participation(event.id, anna.id, 'pending');
    await handlers.requested(
      domainEvent('ParticipationRequested', {
        participationId: p.id,
        eventId: event.id,
        userId: anna.id,
        ...meta(anna.id),
      }),
    );
    expect(await notificationsOf(organization.ownerUserId)).toHaveLength(1);
  });

  it('решение по заявке — участнику, с причиной отказа; самозапись — без уведомления', async () => {
    const { organizer, event } = await eventByUser();
    const [anna, ksenia, maria] = await Promise.all([createUser(), createUser(), createUser()]);
    const accepted = await participation(event.id, anna.id, 'confirmed');
    const rejected = await prisma.participation.create({
      data: {
        eventId: event.id,
        userId: ksenia.id,
        status: 'rejected',
        decisionReason: 'Нужен опыт',
        createdAt: at,
        updatedAt: at,
      },
    });
    const joined = await participation(event.id, maria.id, 'confirmed');
    const base = { eventId: event.id, ...meta(organizer.id) };

    await handlers.confirmed(
      domainEvent('ParticipationConfirmed', {
        ...base,
        participationId: accepted.id,
        userId: anna.id,
        via: 'accept',
      }),
    );
    await handlers.rejected(
      domainEvent('ParticipationRejected', {
        ...base,
        participationId: rejected.id,
        userId: ksenia.id,
        reason: 'Нужен опыт',
      }),
    );
    await handlers.confirmed(
      domainEvent('ParticipationConfirmed', {
        eventId: event.id,
        ...meta(maria.id),
        participationId: joined.id,
        userId: maria.id,
        via: 'join',
      }),
    );

    expect((await notificationsOf(anna.id)).map((n) => n.type)).toEqual([
      'participation_confirmed',
    ]);
    expect(await notificationsOf(ksenia.id)).toMatchObject([
      { type: 'participation_rejected', payload: { reason: 'Нужен опыт' } },
    ]);
    expect(await notificationsOf(maria.id)).toHaveLength(0);
    expect(await notificationsOf(organizer.id)).toHaveLength(0);
  });

  it('отмена участником — организатору «освободилось место»; отмена заявки — без уведомления', async () => {
    const { organizer, event } = await eventByUser();
    const [anna, ksenia] = await Promise.all([createUser(), createUser()]);
    const left = await participation(event.id, anna.id, 'cancelled');
    const withdrawn = await participation(event.id, ksenia.id, 'cancelled');

    await handlers.cancelledByParticipant(
      domainEvent('ParticipationCancelled', {
        eventId: event.id,
        ...meta(anna.id),
        participationId: left.id,
        userId: anna.id,
        previousStatus: 'confirmed',
      }),
    );
    await handlers.cancelledByParticipant(
      domainEvent('ParticipationCancelled', {
        eventId: event.id,
        ...meta(ksenia.id),
        participationId: withdrawn.id,
        userId: ksenia.id,
        previousStatus: 'pending',
      }),
    );

    expect(await notificationsOf(organizer.id)).toMatchObject([
      { type: 'seat_freed', link: `/events/${event.id}` },
    ]);
    expect(await notificationsOf(anna.id)).toHaveLength(0);
  });

  it('вопрос — организатору, ответ организатора — автору вопроса', async () => {
    const { organizer, event } = await eventByUser();
    const anna = await createUser();
    const question = await prisma.message.create({
      data: { eventId: event.id, authorUserId: anna.id, text: 'Где сбор?', createdAt: at },
    });
    const answer = await prisma.message.create({
      data: {
        eventId: event.id,
        authorUserId: organizer.id,
        parentId: question.id,
        text: 'У входа',
        createdAt: at,
      },
    });

    await handlers.messagePosted(
      domainEvent('MessagePosted', {
        messageId: question.id,
        eventId: event.id,
        authorId: anna.id,
        ...meta(anna.id),
      }),
    );
    await handlers.messagePosted(
      domainEvent('MessagePosted', {
        messageId: answer.id,
        eventId: event.id,
        authorId: organizer.id,
        ...meta(organizer.id),
      }),
    );

    expect(await notificationsOf(organizer.id)).toMatchObject([
      { type: 'question_posted', link: `/events/${event.id}#discussion` },
    ]);
    expect(await notificationsOf(anna.id)).toMatchObject([{ type: 'answer_posted' }]);
  });

  it('сторонняя организация в чужом обсуждении — не организатор: её вопрос — организатору, ответ — не «ответ организатора»', async () => {
    const { organizer, event } = await eventByUser();
    const anna = await createUser();
    const outsider = await createOrganization();
    const question = await prisma.message.create({
      data: { eventId: event.id, authorUserId: anna.id, text: 'Где сбор?', createdAt: at },
    });
    const outsiderAnswer = await prisma.message.create({
      data: {
        eventId: event.id,
        authorUserId: outsider.ownerUserId,
        asOrganizationId: outsider.id,
        parentId: question.id,
        text: 'Приходите к нам',
        createdAt: at,
      },
    });
    const outsiderQuestion = await prisma.message.create({
      data: {
        eventId: event.id,
        authorUserId: outsider.ownerUserId,
        asOrganizationId: outsider.id,
        text: 'Можно со своим мячом?',
        createdAt: at,
      },
    });

    for (const message of [outsiderAnswer, outsiderQuestion]) {
      await handlers.messagePosted(
        domainEvent('MessagePosted', {
          messageId: message.id,
          eventId: event.id,
          authorId: outsider.ownerUserId,
          ...meta(outsider.ownerUserId),
        }),
      );
    }

    expect(await notificationsOf(anna.id)).toHaveLength(0);
    expect(await notificationsOf(organizer.id)).toMatchObject([{ type: 'question_posted' }]);
  });

  it('у мероприятия организации ответ её аккаунта — «ответ организатора»', async () => {
    const organization = await createOrganization();
    const sport = await createSport();
    const event = await prisma.event.create({
      data: { ...eventData(sport.id), organizerOrgId: organization.id },
    });
    const anna = await createUser();
    const question = await prisma.message.create({
      data: { eventId: event.id, authorUserId: anna.id, text: 'Где сбор?', createdAt: at },
    });
    const answer = await prisma.message.create({
      data: {
        eventId: event.id,
        authorUserId: organization.ownerUserId,
        asOrganizationId: organization.id,
        parentId: question.id,
        text: 'У входа',
        createdAt: at,
      },
    });
    await handlers.messagePosted(
      domainEvent('MessagePosted', {
        messageId: answer.id,
        eventId: event.id,
        authorId: organization.ownerUserId,
        ...meta(organization.ownerUserId),
      }),
    );
    expect(await notificationsOf(anna.id)).toMatchObject([{ type: 'answer_posted' }]);
  });

  it('снятие модератором — всем записавшимся и организатору, отменившим — нет', async () => {
    const { organizer, event } = await eventByUser();
    const [anna, ksenia, petr, admin] = await Promise.all([
      createUser(),
      createUser(),
      createUser(),
      createUser(),
    ]);
    await participation(event.id, anna.id, 'confirmed');
    await participation(event.id, ksenia.id, 'waitlist');
    await participation(event.id, petr.id, 'cancelled');

    await handlers.unpublished(
      domainEvent('EventUnpublished', { eventId: event.id, reason: 'Спам', ...meta(admin.id) }),
    );

    for (const userId of [organizer.id, anna.id, ksenia.id]) {
      expect(await notificationsOf(userId)).toMatchObject([
        { type: 'event_unpublished', payload: { reason: 'Спам' } },
      ]);
    }
    expect(await notificationsOf(petr.id)).toHaveLength(0);
    expect(await notificationsOf(admin.id)).toHaveLength(0);
  });

  it('перенос организатором — участникам, но не самому организатору', async () => {
    const { organizer, event } = await eventByUser();
    const anna = await createUser();
    await participation(event.id, anna.id, 'confirmed');
    const startsAt = new Date('2026-10-23T12:00:00Z');

    await handlers.rescheduled(
      domainEvent('EventRescheduled', {
        eventId: event.id,
        previousStartsAt: event.startsAt,
        startsAt,
        endsAt: new Date('2026-10-23T13:30:00Z'),
        ...meta(organizer.id),
      }),
    );

    expect(await notificationsOf(anna.id)).toMatchObject([
      { type: 'event_rescheduled', payload: { startsAt: startsAt.toISOString() } },
    ]);
    expect(await notificationsOf(organizer.id)).toHaveLength(0);
  });

  it('решение по заявке организации — её представителю', async () => {
    const organization = await createOrganization();
    await handlers.organizationDecided(
      domainEvent('OrganizationDecided', {
        organizationId: organization.id,
        decision: 'rejected',
        reason: 'Нет контактов',
        ...meta(null),
      }),
    );
    expect(await notificationsOf(organization.ownerUserId)).toMatchObject([
      {
        type: 'organization_decided',
        payload: { organizationName: 'Клуб', decision: 'rejected', reason: 'Нет контактов' },
        link: '/profile',
      },
    ]);
  });

  it('обработчик подписан на шину: событие после коммита создаёт уведомление', async () => {
    const { organizer, event } = await eventByUser();
    const anna = await createUser();
    const p = await participation(event.id, anna.id, 'pending');

    app.get(EventBus).publish(
      domainEvent('ParticipationRequested', {
        participationId: p.id,
        eventId: event.id,
        userId: anna.id,
        ...meta(anna.id),
      }),
    );

    await expect
      .poll(async () => (await notificationsOf(organizer.id)).length, { timeout: 5000 })
      .toBe(1);
  });
});

describe('центр уведомлений: GET /notifications, POST /notifications/read', () => {
  async function signedIn() {
    const email = `anna-${randomUUID()}@example.ru`;
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ accountType: 'person', name: 'Анна', email, password: 'пароль-1234' });
    const header = response.headers['set-cookie'] as unknown as string[];
    const cookie = header.find((line) => line.startsWith('tandem_session='))?.split(';')[0] ?? '';
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return { cookie, userId: user.id };
  }

  async function seed(userId: string) {
    const other = await createUser();
    await prisma.notification.createMany({
      data: [
        {
          userId,
          type: 'participation_confirmed',
          payload: { eventTitle: 'Скалолазание' },
          link: '/events/1',
          createdAt: new Date('2026-10-19T10:00:00Z'),
        },
        {
          userId,
          type: 'event_unpublished',
          payload: { eventTitle: 'Волейбол', reason: 'Спам' },
          link: '/events/2',
          createdAt: new Date('2026-10-19T11:00:00Z'),
        },
        { userId: other.id, type: 'question_posted', payload: {}, link: '/x', createdAt: at },
      ],
    });
    return other;
  }

  it('гостю — 401', async () => {
    expect((await request(app.getHttpServer()).get('/notifications')).status).toBe(401);
    expect((await request(app.getHttpServer()).post('/notifications/read').send({})).status).toBe(
      401,
    );
  });

  it('свои уведомления, новые сверху, одной строкой с пиктограммой и счётчиком', async () => {
    const { cookie, userId } = await signedIn();
    await seed(userId);

    const response = await request(app.getHttpServer()).get('/notifications').set('Cookie', cookie);
    expect(response.status).toBe(200);
    expect(response.body.unread).toBe(2);
    expect(response.body.items).toMatchObject([
      {
        type: 'event_unpublished',
        icon: 'action-hide',
        text: '«Волейбол» снято с публикации модератором. Причина: Спам',
        link: '/events/2',
        read: false,
      },
      {
        type: 'participation_confirmed',
        icon: 'status-confirmed',
        text: 'Заявка на «Скалолазание» принята — вы участник',
        read: false,
      },
    ]);
  });

  it('отметить прочитанными выбранные или все; чужие не трогаются', async () => {
    const { cookie, userId } = await signedIn();
    const other = await seed(userId);
    const [first] = (await request(app.getHttpServer()).get('/notifications').set('Cookie', cookie))
      .body.items as { id: string }[];
    const foreign = await prisma.notification.findFirstOrThrow({ where: { userId: other.id } });

    const one = await request(app.getHttpServer())
      .post('/notifications/read')
      .set('Cookie', cookie)
      .send({ ids: [first?.id, foreign.id] });
    expect(one.status).toBe(200);
    expect(one.body).toEqual({ unread: 1 });
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: foreign.id } })).readAt,
    ).toBeNull();

    const all = await request(app.getHttpServer())
      .post('/notifications/read')
      .set('Cookie', cookie)
      .send({});
    expect(all.body).toEqual({ unread: 0 });
  });

  it('неверный список — ошибка поля', async () => {
    const { cookie } = await signedIn();
    const response = await request(app.getHttpServer())
      .post('/notifications/read')
      .set('Cookie', cookie)
      .send({ ids: ['не-uuid'] });
    expect(response.status).toBe(400);
    expect(response.body.fields).toHaveProperty('ids');
  });
});
