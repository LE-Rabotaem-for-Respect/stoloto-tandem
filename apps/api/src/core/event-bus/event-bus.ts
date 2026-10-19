import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { logEntry } from '../errors/log-entry';
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

const logger = new Logger('DomainEvent');
const guarded = Symbol('guarded');

type Handler = ((...args: unknown[]) => unknown) & { [guarded]?: true };

/**
 * Обработчик в своём try/catch: ошибку пишет общий `logEntry` без данных
 * вызова. С `suppressErrors` библиотека сама пишет в журнал текст ошибки
 * целиком, поэтому он выключен. `logEntry` не бросает: исключение из catch
 * стало бы необработанным отказом и остановило бы процесс api.
 */
function guard(name: string, handler: Handler): Handler {
  if (handler[guarded]) return handler;
  const wrapped: Handler = async function (this: unknown, ...args: unknown[]) {
    try {
      return await handler.apply(this, args);
    } catch (error) {
      logger.error(`Обработчик ${name} упал: ${logEntry(error)}`);
    }
  };
  // Метаданные других декораторов метода (в том числе подписки) остаются на обёртке
  for (const key of Reflect.getMetadataKeys(handler)) {
    Reflect.defineMetadata(key, Reflect.getMetadata(key, handler), wrapped);
  }
  wrapped[guarded] = true;
  return wrapped;
}

/** Подписка на событие из перечня `events.ts`; обработчик идёт асинхронно. */
export const OnDomainEvent =
  (type: DomainEventType): MethodDecorator =>
  (target, key, descriptor) => {
    const name = `${target.constructor.name}.${String(key)}`;
    descriptor.value = guard(name, descriptor.value as Handler) as typeof descriptor.value;
    return OnEvent(type, { async: true, suppressErrors: false })(target, key, descriptor);
  };
