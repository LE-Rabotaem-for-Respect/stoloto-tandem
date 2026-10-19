import { defineMachine } from './machine';
import type { Denial } from './machine';

export const PARTICIPATION_STATUSES = [
  'pending',
  'confirmed',
  'waitlist',
  'rejected',
  'cancelled',
] as const;
export type ParticipationStatus = (typeof PARTICIPATION_STATUSES)[number];

export const PARTICIPATION_ACTIONS = ['join', 'accept', 'reject', 'promote', 'cancel'] as const;
export type ParticipationAction = (typeof PARTICIPATION_ACTIONS)[number];

export const EVENT_MODES = ['free', 'approval'] as const;
export type EventMode = (typeof EVENT_MODES)[number];

export interface ParticipationContext {
  mode: EventMode;
  /** Есть ли свободное место (лимит не задан — места есть всегда). */
  hasSeats: boolean;
}

const seatsAvailable = (ctx: ParticipationContext): Denial | undefined =>
  ctx.hasSeats
    ? undefined
    : { code: 'no_seats', message: 'Мест нет: увеличьте лимит или дождитесь отмены' };

const deniedMessages: Record<Exclude<ParticipationAction, 'join'>, string> = {
  accept: 'Заявка уже рассмотрена или отменена',
  reject: 'Заявка уже рассмотрена или отменена',
  promote: 'Запись не в листе ожидания',
  cancel: 'Запись уже отменена или отклонена',
};

/**
 * Запись на мероприятие (ТЗ 4.3, 2.4, 3.2). `join` из `null` и `cancelled`
 * создаёт новую запись. Условия события (опубликовано, не завершено,
 * пользователь не организатор) и роль исполнителя проверяют политики.
 */
export const participationMachine = defineMachine<
  ParticipationStatus,
  ParticipationAction,
  ParticipationContext
>({
  name: 'participation',
  rules: [
    {
      action: 'join',
      from: [null, 'cancelled'],
      to: (ctx) => (ctx.mode === 'approval' ? 'pending' : ctx.hasSeats ? 'confirmed' : 'waitlist'),
    },
    { action: 'accept', from: ['pending'], to: 'confirmed', guards: [seatsAvailable] },
    { action: 'reject', from: ['pending'], to: 'rejected' },
    { action: 'promote', from: ['waitlist'], to: 'confirmed', guards: [seatsAvailable] },
    { action: 'cancel', from: ['pending', 'confirmed', 'waitlist'], to: 'cancelled' },
  ],
  denied: (from, action) => {
    if (action !== 'join') return { code: 'invalid_transition', message: deniedMessages[action] };
    if (from === 'rejected') {
      return {
        code: 'rejected_final',
        message: 'После отказа повторная заявка на это мероприятие недоступна',
      };
    }
    return { code: 'already_joined', message: 'Вы уже записаны на это мероприятие' };
  },
});
