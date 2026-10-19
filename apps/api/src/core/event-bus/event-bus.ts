import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import type { DomainEvent, DomainEventType } from './events';

/**
 * Шина доменных событий. Сервис не ждёт обработчиков, а ошибка обработчика
 * логируется и не ломает основное действие (ТЗ 4.2).
 */
@Injectable()
export class EventBus {
  constructor(private readonly emitter: EventEmitter2) {}

  publish(...events: DomainEvent[]) {
    for (const event of events) this.emitter.emit(event.type, event);
  }

  /**
   * Выполняет работу (обычно `prisma.$transaction`) и публикует собранные
   * события только после её успеха: после отката ни одно не уходит.
   */
  async afterCommit<T>(work: (emit: (event: DomainEvent) => void) => Promise<T>): Promise<T> {
    const pending: DomainEvent[] = [];
    const result = await work((event) => pending.push(event));
    this.publish(...pending);
    return result;
  }
}

/** Подписка на событие из перечня `events.ts`; обработчик идёт асинхронно. */
export const OnDomainEvent = (type: DomainEventType) =>
  OnEvent(type, { async: true, suppressErrors: true });
