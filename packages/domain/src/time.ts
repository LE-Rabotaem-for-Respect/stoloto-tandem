/**
 * Пояс пользователей платформы. Время хранится в UTC, а «сегодня», «завтра»,
 * «выходные» и отображение дат считаются в этом поясе.
 */
export const TIME_ZONE = 'Asia/Krasnoyarsk';

/** Полуоткрытый интервал времени: `from` входит, `to` — нет. */
export interface TimeRange {
  from: Date;
  to: Date;
}

const zonedFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

function zonedParts(date: Date) {
  const parts: Record<string, number> = {};
  for (const { type, value } of zonedFormat.formatToParts(date)) {
    if (type !== 'literal') parts[type] = Number(value);
  }
  return parts as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>;
}

/** Смещение пояса относительно UTC в момент `date`, в миллисекундах. */
function zoneOffset(date: Date): number {
  const p = zonedParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

function calendarDate(date: Date): CalendarDate {
  const { year, month, day } = zonedParts(date);
  return { year, month, day };
}

/** Полночь календарной даты (с переносом через границы месяца) в поясе платформы. */
function zonedMidnight({ year, month, day }: CalendarDate): Date {
  const guess = Date.UTC(year, month - 1, day);
  return new Date(guess - zoneOffset(new Date(guess)));
}

function shiftDays(date: CalendarDate, days: number): CalendarDate {
  return { ...date, day: date.day + days };
}

/** День недели в поясе платформы: 0 — воскресенье, 6 — суббота. */
function zonedWeekday(date: Date): number {
  const { year, month, day } = calendarDate(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Начало суток, в которые попадает `date`, по времени платформы. */
export function startOfDay(date: Date): Date {
  return zonedMidnight(calendarDate(date));
}

/** Конец суток по времени платформы — начало следующих суток (граница не входит в день). */
export function endOfDay(date: Date): Date {
  return zonedMidnight(shiftDays(calendarDate(date), 1));
}

/** Сутки, в которые попадает `date`, как интервал `[from, to)`. */
export function dayRange(date: Date): TimeRange {
  return { from: startOfDay(date), to: endOfDay(date) };
}

/** Фильтр «Сегодня»: текущие сутки по времени платформы. */
export function todayRange(now: Date): TimeRange {
  return dayRange(now);
}

/** Фильтр «Завтра»: следующие сутки по времени платформы. */
export function tomorrowRange(now: Date): TimeRange {
  const tomorrow = shiftDays(calendarDate(now), 1);
  return { from: zonedMidnight(tomorrow), to: zonedMidnight(shiftDays(tomorrow, 1)) };
}

/**
 * Фильтр «Выходные»: ближайшие суббота и воскресенье. В субботу — с начала
 * субботы, в воскресенье — только воскресенье.
 */
export function weekendRange(now: Date): TimeRange {
  const today = calendarDate(now);
  const weekday = zonedWeekday(now);
  const sunday = shiftDays(today, weekday === 0 ? 0 : 7 - weekday);
  const from = weekday === 0 ? today : shiftDays(sunday, -1);
  return { from: zonedMidnight(from), to: zonedMidnight(shiftDays(sunday, 1)) };
}

function within(date: Date, { from, to }: TimeRange): boolean {
  return date >= from && date < to;
}

export function isToday(date: Date, now: Date): boolean {
  return within(date, todayRange(now));
}

export function isTomorrow(date: Date, now: Date): boolean {
  return within(date, tomorrowRange(now));
}
