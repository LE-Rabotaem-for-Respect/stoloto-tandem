import type { EventStatus } from './state-machines';

/** Статусы мероприятия для показа: хранимые плюс вычисляемые по времени и местам. */
export const EVENT_DISPLAY_STATUSES = [
  'open',
  'full',
  'rescheduled',
  'ongoing',
  'finished',
  'cancelled',
  'unpublished',
  'deleted',
] as const;
export type EventDisplayStatus = (typeof EVENT_DISPLAY_STATUSES)[number];

export interface DisplayStatusEvent {
  status: EventStatus;
  startsAt: Date;
  endsAt: Date;
  /** Лимит мест; `null` — без ограничения. */
  capacity: number | null;
  /** Время начала до переноса; `null` — событие не переносили. */
  previousStartsAt: Date | null;
}

/**
 * Статус мероприятия для API и интерфейса (ТЗ 4.3). Хранимые `cancelled`,
 * `unpublished`, `deleted` показываются как есть; у опубликованного по порядку:
 * «Завершено» (`endsAt < now`), «Идёт», «Перенесено», «Мест нет», «Набор открыт».
 * `now` — время из Clock (api) или `useClock()` (web).
 */
export function displayStatus(
  event: DisplayStatusEvent,
  now: Date,
  confirmedCount: number,
): EventDisplayStatus {
  if (event.status !== 'published') return event.status;
  if (event.endsAt < now) return 'finished';
  if (event.startsAt <= now) return 'ongoing';
  if (event.previousStartsAt) return 'rescheduled';
  if (event.capacity !== null && confirmedCount >= event.capacity) return 'full';
  return 'open';
}
