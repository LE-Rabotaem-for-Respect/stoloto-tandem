import { TIME_ZONE, startOfDay } from '@tandem/domain';

const format = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('ru-RU', { timeZone: TIME_ZONE, ...options });

const monthShort = format({ month: 'short' });
const dayOfMonth = format({ day: 'numeric' });
const weekdayShort = format({ weekday: 'short' });
const fullDate = format({ weekday: 'long', day: 'numeric', month: 'long' });
const clock = format({ hour: '2-digit', minute: '2-digit' });
const numericDayMonth = format({ day: '2-digit', month: '2-digit' });

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Подписи листка даты по Красноярску: «окт», «21», «ср» и «Среда, 21 октября» для чтецов. */
export function leafParts(date: Date) {
  return {
    month: monthShort.format(date).replace('.', ''),
    day: dayOfMonth.format(date),
    weekday: weekdayShort.format(date).replace('.', ''),
    spoken: capitalize(fullDate.format(date)),
  };
}

/** «21.10» по Красноярску — для метки переноса «Перенесено с 21.10 на 22.10». */
export function dayMonth(date: Date): string {
  return numericDayMonth.format(date);
}

/** «07:30–08:30» или «07:30». */
export function timeRange(startsAt: Date, endsAt?: Date): string {
  return endsAt ? `${clock.format(startsAt)}–${clock.format(endsAt)}` : clock.format(startsAt);
}

function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const DAY_MS = 86_400_000;

/**
 * Относительная подпись к дате по календарным дням Красноярска: «сегодня»,
 * «завтра», «через 2 дня», «вчера», «5 дней назад»; закончилось — «прошло».
 */
export function relativeDay(startsAt: Date, now: Date, endsAt?: Date): string {
  if (endsAt && endsAt <= now) return 'прошло';
  const days = Math.round((startOfDay(startsAt).getTime() - startOfDay(now).getTime()) / DAY_MS);
  if (days === 0) return 'сегодня';
  if (days === 1) return 'завтра';
  if (days === -1) return 'вчера';
  const count = Math.abs(days);
  const word = plural(count, 'день', 'дня', 'дней');
  return days > 0 ? `через ${count} ${word}` : `${count} ${word} назад`;
}
