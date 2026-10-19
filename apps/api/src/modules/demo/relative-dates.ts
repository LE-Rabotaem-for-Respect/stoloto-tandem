import { TIME_ZONE, startOfDay } from '@tandem/domain';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** «Ближайший день недели» не начинается раньше чем через столько часов: событие не стартует во время проверки. */
const MIN_LEAD_MS = 3 * HOUR_MS;

const weekdayFormat = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, weekday: 'short' });
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Полдень дня не попадает на границу суток ни при каком смещении пояса
function dayStart(now: Date, days: number): Date {
  return startOfDay(new Date(startOfDay(now).getTime() + days * DAY_MS + 12 * HOUR_MS));
}

function withTime(day: Date, time: string): Date {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return new Date(day.getTime() + hours * HOUR_MS + minutes * 60_000);
}

/** День недели в поясе платформы: 0 — воскресенье, 6 — суббота. */
function weekday(day: Date): number {
  return WEEKDAYS.indexOf(weekdayFormat.format(new Date(day.getTime() + 12 * HOUR_MS)));
}

/** «Завтра», «через N дней», «N дней назад»: календарный день Красноярска плюс `days`, время `HH:MM`. */
export function dayAt(now: Date, days: number, time: string): Date {
  return withTime(dayStart(now, days), time);
}

/**
 * «Ближайший <день недели>» (или ближайший из нескольких): первый такой
 * день, у которого начало хотя бы на 3 часа позже `now`, иначе — через неделю.
 */
export function nearestWeekdayAt(now: Date, weekdays: readonly number[], time: string): Date {
  for (let days = 0; days <= 7; days += 1) {
    const day = dayStart(now, days);
    const start = withTime(day, time);
    if (weekdays.includes(weekday(day)) && start.getTime() - now.getTime() >= MIN_LEAD_MS) {
      return start;
    }
  }
  throw new Error(`Не найден день недели из ${weekdays.join(', ')}`);
}

/** Когда проходит мероприятие: календарный день от сегодня или ближайший из дней недели (0 — воскресенье). */
export type EventWhen =
  | { days: number; from: string; to: string }
  | { weekdays: readonly number[]; from: string; to: string };

/**
 * Начало — по правилу «через N дней» или «ближайший день недели», окончание —
 * в тот же календарный день по времени `to`. Правило трёх часов относится
 * только к началу: иначе окончание осталось бы сегодня, а начало ушло бы на неделю.
 */
export function eventTimes(now: Date, when: EventWhen): { startsAt: Date; endsAt: Date } {
  const startsAt =
    'days' in when
      ? dayAt(now, when.days, when.from)
      : nearestWeekdayAt(now, when.weekdays, when.from);
  return { startsAt, endsAt: dayAt(startsAt, 0, when.to) };
}
