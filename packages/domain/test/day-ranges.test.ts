import { describe, expect, it } from 'vitest';
import {
  calendarDayRange,
  dayRange,
  endOfDay,
  isToday,
  isTomorrow,
  startOfDay,
  todayRange,
  tomorrowRange,
  weekendRange,
} from '../src';

const at = (iso: string) => new Date(iso);

// Красноярск — UTC+7: полночь по Красноярску — 17:00 UTC предыдущих суток.
// 2026-10-19 — понедельник.

describe('startOfDay и endOfDay', () => {
  it('начало дня — полночь по Красноярску', () => {
    expect(startOfDay(at('2026-10-19T10:00:00Z'))).toEqual(at('2026-10-18T17:00:00Z'));
  });

  it('вечер по UTC уже следующий день в Красноярске', () => {
    // 2026-10-19 18:30 UTC — 2026-10-20 01:30 в Красноярске
    expect(startOfDay(at('2026-10-19T18:30:00Z'))).toEqual(at('2026-10-19T17:00:00Z'));
  });

  it('ровно полночь по Красноярску относится к начинающемуся дню', () => {
    expect(startOfDay(at('2026-10-18T17:00:00Z'))).toEqual(at('2026-10-18T17:00:00Z'));
  });

  it('за миллисекунду до полуночи — ещё предыдущий день', () => {
    expect(startOfDay(at('2026-10-18T16:59:59.999Z'))).toEqual(at('2026-10-17T17:00:00Z'));
  });

  it('конец дня — начало следующего (граница не включается)', () => {
    expect(endOfDay(at('2026-10-19T10:00:00Z'))).toEqual(at('2026-10-19T17:00:00Z'));
  });
});

describe('dayRange', () => {
  it('возвращает полуоткрытый интервал суток [from, to)', () => {
    expect(dayRange(at('2026-10-19T10:00:00Z'))).toEqual({
      from: at('2026-10-18T17:00:00Z'),
      to: at('2026-10-19T17:00:00Z'),
    });
  });
});

describe('«Сегодня» и «Завтра»', () => {
  const now = at('2026-10-19T10:00:00Z'); // понедельник, 17:00 в Красноярске

  it('todayRange — текущие сутки по Красноярску', () => {
    expect(todayRange(now)).toEqual({
      from: at('2026-10-18T17:00:00Z'),
      to: at('2026-10-19T17:00:00Z'),
    });
  });

  it('tomorrowRange — следующие сутки по Красноярску', () => {
    expect(tomorrowRange(now)).toEqual({
      from: at('2026-10-19T17:00:00Z'),
      to: at('2026-10-20T17:00:00Z'),
    });
  });

  it('isToday учитывает границу полуночи в UTC+7', () => {
    expect(isToday(at('2026-10-18T17:00:00Z'), now)).toBe(true);
    expect(isToday(at('2026-10-19T16:59:59.999Z'), now)).toBe(true);
    expect(isToday(at('2026-10-19T17:00:00Z'), now)).toBe(false);
    expect(isToday(at('2026-10-18T16:59:59.999Z'), now)).toBe(false);
  });

  it('isTomorrow учитывает границу полуночи в UTC+7', () => {
    expect(isTomorrow(at('2026-10-19T17:00:00Z'), now)).toBe(true);
    expect(isTomorrow(at('2026-10-20T16:59:59.999Z'), now)).toBe(true);
    expect(isTomorrow(at('2026-10-20T17:00:00Z'), now)).toBe(false);
    expect(isTomorrow(at('2026-10-19T16:59:59.999Z'), now)).toBe(false);
  });

  it('«сегодня» по Красноярску отличается от «сегодня» по UTC поздно вечером', () => {
    // 2026-10-19 20:00 UTC — уже 20 октября 03:00 в Красноярске
    const lateUtc = at('2026-10-19T20:00:00Z');
    expect(isToday(at('2026-10-20T05:00:00Z'), lateUtc)).toBe(true);
    expect(isTomorrow(at('2026-10-20T05:00:00Z'), lateUtc)).toBe(false);
  });
});

describe('weekendRange', () => {
  const weekend = { from: at('2026-10-23T17:00:00Z'), to: at('2026-10-25T17:00:00Z') }; // сб 24.10 — вс 25.10

  it('в будний день — ближайшие суббота и воскресенье', () => {
    expect(weekendRange(at('2026-10-19T10:00:00Z'))).toEqual(weekend); // понедельник
    expect(weekendRange(at('2026-10-23T16:59:59Z'))).toEqual(weekend); // пятница, 23:59 в Красноярске
  });

  it('в субботу — с начала субботы до конца воскресенья', () => {
    expect(weekendRange(at('2026-10-23T17:00:00Z'))).toEqual(weekend); // суббота, 00:00 в Красноярске
    expect(weekendRange(at('2026-10-24T12:00:00Z'))).toEqual(weekend); // суббота, 19:00
  });

  it('в воскресенье — только оставшееся воскресенье', () => {
    expect(weekendRange(at('2026-10-25T03:00:00Z'))).toEqual({
      from: at('2026-10-24T17:00:00Z'),
      to: at('2026-10-25T17:00:00Z'),
    });
  });

  it('суббота по Красноярску, но ещё пятница по UTC', () => {
    // 2026-10-23 18:00 UTC — суббота 01:00 в Красноярске
    expect(weekendRange(at('2026-10-23T18:00:00Z'))).toEqual(weekend);
  });
});

describe('calendarDayRange: сутки календарной даты по Красноярску', () => {
  it('2026-10-21 — с 17:00 UTC 20-го до 17:00 UTC 21-го', () => {
    expect(calendarDayRange('2026-10-21')).toEqual({
      from: new Date('2026-10-20T17:00:00Z'),
      to: new Date('2026-10-21T17:00:00Z'),
    });
  });

  it('последний день месяца переходит в следующий месяц', () => {
    expect(calendarDayRange('2026-10-31')?.to).toEqual(new Date('2026-10-31T17:00:00Z'));
  });

  it.each(['2030-02-30', '2026-13-01', '2026-10-1', '21.10.2026', ''])(
    '«%s» — не дата',
    (value) => {
      expect(calendarDayRange(value)).toBeNull();
    },
  );
});
