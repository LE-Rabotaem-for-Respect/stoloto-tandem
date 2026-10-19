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
}

describe('core/event-bus: перечень доменных событий', () => {
  it('стартовый состав DECISION-002 и события записи из #246', () => {
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
    expect(logged).toHaveBeenCalledWith('обработчик уведомлений упал', expect.any(String));
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
