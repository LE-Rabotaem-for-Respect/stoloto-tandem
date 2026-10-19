import 'reflect-metadata';
import { Injectable, Logger } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
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

  @OnDomainEvent('EventRestored')
  @OnEvent('EventUpdated')
  restoredOrUpdated(event: DomainEvent<'EventRestored'> | DomainEvent<'EventUpdated'>) {
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

  @OnDomainEvent('EventCreated')
  throwsNull() {
    throw null;
  }

  @OnDomainEvent('EventCreated')
  throwsBareObject() {
    throw Object.create(null);
  }

  @OnDomainEvent('EventCreated')
  created(event: DomainEvent<'EventCreated'>) {
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
    const written = String(logged.mock.calls[0]?.[0]);
    expect(written).toContain('Handlers.failing');
    expect(written).toMatch(/: Error\n\s+at /);
    // Текст обычной ошибки может содержать данные пользователя — в журнал он не идёт
    expect(written).not.toContain('обработчик уведомлений упал');
  });

  it('обработчик бросил null или объект без прототипа — запись в журнале, процесс жив', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const created = domainEvent('EventCreated', {
      eventId: 'e-1',
      actorId: 'u-1',
      occurredAt,
    });
    bus.publish(created);
    await nextTick();
    await nextTick();
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    expect(handlers.received).toEqual([created]);
    const written = logged.mock.calls.map((call) => String(call[0]));
    expect(written).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Handlers.throwsNull упал: Брошено не Error, а null'),
        expect.stringContaining('Handlers.throwsBareObject упал: Брошено не Error, а object'),
      ]),
    );
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
    expect(written).toContain('Handlers.prismaFailing');
    expect(written).toContain('PrismaClientValidationError');
    expect(written).not.toContain('anna@demo');
    expect(written).not.toContain('вас приняли');
  });

  it('подписки других декораторов метода сохраняются', async () => {
    const restored = domainEvent('EventRestored', {
      eventId: 'e-1',
      actorId: 'u-admin',
      occurredAt,
    });
    const updated = domainEvent('EventUpdated', {
      eventId: 'e-1',
      fields: ['title'],
      actorId: 'u-organizer',
      occurredAt,
    });
    bus.publish(restored, updated);
    await nextTick();
    expect(handlers.received).toHaveLength(2);
    expect(handlers.received).toEqual(expect.arrayContaining([restored, updated]));
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
