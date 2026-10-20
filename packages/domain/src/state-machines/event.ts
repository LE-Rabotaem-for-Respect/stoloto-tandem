import { defineMachine, reasonRequired } from './machine';
import type { Denial } from './machine';

/** Хранимые статусы мероприятия. «Мест нет», «Перенесено», «Идёт», «Завершено» вычисляет `displayStatus`. */
export const EVENT_STATUSES = ['published', 'cancelled', 'unpublished', 'deleted'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_ACTIONS = [
  'publish',
  'edit',
  'reschedule',
  'cancel',
  'unpublish',
  'delete',
  'restore',
] as const;
export type EventAction = (typeof EVENT_ACTIONS)[number];

export interface EventContext {
  /** Текущее время из Clock. */
  now: Date;
  startsAt: Date;
  /** Новое время начала при переносе. */
  newStartsAt?: Date;
  reason?: string;
}

const notStarted = (ctx: EventContext): Denial | undefined =>
  ctx.now < ctx.startsAt
    ? undefined
    : { code: 'event_started', message: 'Мероприятие уже началось: изменить его нельзя' };

const startInFuture = (ctx: EventContext): Denial | undefined =>
  ctx.now < ctx.startsAt
    ? undefined
    : { code: 'start_not_in_future', message: 'Время начала должно быть в будущем' };

const newStartInFuture = (ctx: EventContext): Denial | undefined =>
  ctx.newStartsAt && ctx.now < ctx.newStartsAt
    ? undefined
    : { code: 'start_not_in_future', message: 'Новое время начала должно быть в будущем' };

const deniedMessages: Record<EventAction, string> = {
  publish: 'Мероприятие уже опубликовано',
  edit: 'Изменить можно только опубликованное мероприятие',
  reschedule: 'Перенести можно только опубликованное мероприятие',
  cancel: 'Отменить можно только опубликованное мероприятие',
  unpublish: 'Снять с публикации можно только опубликованное мероприятие',
  delete: 'Мероприятие уже удалено',
  restore: 'Восстановить можно только снятое с публикации мероприятие',
};

/** Мероприятие (ТЗ 4.3, 2.2, 2.10, 3.3). Кто выполняет действие, проверяют политики. */
export const eventMachine = defineMachine<EventStatus, EventAction, EventContext>({
  name: 'event',
  rules: [
    { action: 'publish', from: [null], to: 'published', guards: [startInFuture] },
    // Изменение после публикации (ТЗ 2.2): поля — без смены статуса, только до начала
    { action: 'edit', from: ['published'], to: 'published', guards: [notStarted] },
    {
      action: 'reschedule',
      from: ['published'],
      to: 'published',
      guards: [notStarted, newStartInFuture],
    },
    {
      action: 'cancel',
      from: ['published'],
      to: 'cancelled',
      guards: [notStarted, reasonRequired],
    },
    { action: 'unpublish', from: ['published'], to: 'unpublished', guards: [reasonRequired] },
    {
      action: 'delete',
      from: ['published', 'unpublished', 'cancelled'],
      to: 'deleted',
      guards: [reasonRequired],
    },
    { action: 'restore', from: ['unpublished'], to: 'published' },
  ],
  denied: (_from, action) => ({ code: 'invalid_transition', message: deniedMessages[action] }),
});
