import 'reflect-metadata';
import { Injectable, Logger } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DOMAIN_EVENT_TYPES,
  EventBus,
  EventBusModule,
  OnDomainEvent,
  domainEvent,
} from '../src/core/event-bus';
import type { DomainEvent } from '../src/core/event-bus';
import { Prisma } from '../src/generated/prisma/client';

const occurredAt = new Date('2026-10-19T05:00:00Z');
const confirmed = () =>
  domainEvent('ParticipationConfirmed', {
    participationId: 'p-1',
    eventId: 'e-1',
    userId: 'u-1',
    via: 'accept',
    actorId: 'u-organizer',
    occurredAt,
  });

const posted = () =>
  domainEvent('MessagePosted', {
    messageId: 'm-1',
    eventId: 'e-1',
    authorId: 'u-1',
    actorId: 'u-1',
    occurredAt,
  });

const nextTick = () => new Promise((resolve) => setImmediate(resolve));

@Injectable()
class Handlers {
  received: DomainEvent[] = [];

  @OnDomainEvent('ParticipationConfirmed')
  failing() {
    throw new Error('обработчик уведомлений упал');
  }

  @OnDomainEvent('ParticipationConfirmed')
  notify(event: DomainEvent<'ParticipationConfirmed'>) {
    this.received.push(event);
  }

  @OnDomainEvent('EventCancelled')
  cancelled(event: DomainEvent<'EventCancelled'>) {
    this.received.push(event);
  }

  @OnDomainEvent('MessagePosted')
  prismaFailing() {
    throw new Prisma.PrismaClientValidationError(
      'Invalid prisma.notification.create() invocation: data: { email: "anna@demo", text: "Анна, вас приняли" }',
      { clientVersion: 'test' },
    );
  }

  @OnDomainEvent('MessagePosted')
  posted(event: DomainEvent<'MessagePosted'>) {
    this.received.push(event);
  }
}

describe('core/event-bus: перечень доменных событий', () => {
  it('стартовый состав DECISION-002 и события попадания в лист ожидания', () => {
    expect([...DOMAIN_EVENT_TYPES].sort()).toEqual(
      [
        'EventCreated',
        'EventUpdated',
        'EventRescheduled',
        'EventCancelled',
        'EventUnpublished',
        'EventRestored',
        'EventDeleted',
        'ParticipationRequested',
        'ParticipationConfirmed',
        'ParticipationWaitlisted',
        'ParticipationRejected',
        'ParticipationCancelled',
        'ParticipationPromotedFromWaitlist',
        'MessagePosted',
        'MessageHidden',
        'MessageDeleted',
        'OrganizationSubmitted',
        'OrganizationDecided',
      ].sort(),
    );
  });

  it('событие несёт тип, id сущности, actorId и occurredAt', () => {
    expect(confirmed()).toEqual({
      type: 'ParticipationConfirmed',
      participationId: 'p-1',
      eventId: 'e-1',
      userId: 'u-1',
      via: 'accept',
      actorId: 'u-organizer',
      occurredAt,
    });
  });
});

describe('core/event-bus: публикация и обработчики', () => {
  let app: INestApplication;
  let bus: EventBus;
  let handlers: Handlers;
  const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EventBusModule],
      providers: [Handlers],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    bus = app.get(EventBus);
    handlers = app.get(Handlers);
  });

  beforeEach(() => {
    handlers.received = [];
    logged.mockClear();
  });

  afterAll(async () => {
    logged.mockRestore();
    await app.close();
  });

  it('publish не ждёт обработчиков', async () => {
    bus.publish(confirmed());
    expect(handlers.received).toEqual([]);
    await nextTick();
    expect(handlers.received).toEqual([confirmed()]);
  });

  it('ошибка обработчика логируется и не мешает остальным', async () => {
    expect(() => bus.publish(confirmed())).not.toThrow();
    await nextTick();
    expect(handlers.received).toHaveLength(1);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logged.mock.calls)).toContain('обработчик уведомлений упал');
  });

  it('ошибка Prisma в обработчике — в журнале без аргументов вызова, действие выполнено', async () => {
    const result = await bus.afterCommit(async (emit) => {
      emit(posted());
      return 'сообщение сохранено';
    });
    await nextTick();
    expect(result).toBe('сообщение сохранено');
    expect(handlers.received).toEqual([posted()]);
    const written = JSON.stringify(logged.mock.calls);
    expect(written).toContain('MessagePosted');
    expect(written).toContain('PrismaClientValidationError');
    expect(written).not.toContain('anna@demo');
    expect(written).not.toContain('вас приняли');
  });

  it('afterCommit публикует события только после успешной работы', async () => {
    const cancelled = domainEvent('EventCancelled', {
      eventId: 'e-1',
      reason: 'Дождь',
      actorId: 'u-organizer',
      occurredAt,
    });
    const result = await bus.afterCommit(async (emit) => {
      emit(cancelled);
      await nextTick();
      expect(handlers.received).toEqual([]);
      return 'готово';
    });
    expect(result).toBe('готово');
    await nextTick();
    expect(handlers.received).toEqual([cancelled]);
  });

  it('afterCommit: при ошибке (откат транзакции) события не публикуются', async () => {
    await expect(
      bus.afterCommit(async (emit) => {
        emit(confirmed());
        throw new Error('транзакция откатилась');
      }),
    ).rejects.toThrow('транзакция откатилась');
    await nextTick();
    expect(handlers.received).toEqual([]);
  });
});
