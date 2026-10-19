import { describe, expect, it } from 'vitest';
import { dayAt, eventTimes, nearestWeekdayAt } from '../src/modules/demo/relative-dates';

// Красноярск — UTC+7: 10:00 по Красноярску — это 03:00 UTC
const krsk = (local: string) => new Date(`${local}+07:00`);
const iso = (local: string) => krsk(local).toISOString();

describe('относительные даты сида — по календарю Красноярска', () => {
  const mondayMorning = krsk('2026-10-19T10:00:00');

  it('«завтра», «послезавтра», «через N дней» — календарный день плюс N, время из таблицы', () => {
    expect(dayAt(mondayMorning, 1, '17:00').toISOString()).toBe(iso('2026-10-20T17:00:00'));
    expect(dayAt(mondayMorning, 2, '08:00').toISOString()).toBe(iso('2026-10-21T08:00:00'));
    expect(dayAt(mondayMorning, 3, '18:30').toISOString()).toBe(iso('2026-10-22T18:30:00'));
  });

  it('«N дней назад» и переход через границу месяца', () => {
    expect(dayAt(mondayMorning, -12, '05:30').toISOString()).toBe(iso('2026-10-07T05:30:00'));
    expect(dayAt(krsk('2026-10-30T10:00:00'), 3, '12:00').toISOString()).toBe(
      iso('2026-11-02T12:00:00'),
    );
  });

  it('календарный день — по Красноярску, а не по UTC', () => {
    // 23:30 понедельника в Красноярске — это ещё понедельник 16:30 UTC; «завтра» — вторник
    const lateMonday = krsk('2026-10-19T23:30:00');
    expect(dayAt(lateMonday, 1, '08:00').toISOString()).toBe(iso('2026-10-20T08:00:00'));
    // 02:00 вторника в Красноярске — это понедельник по UTC; «завтра» — среда
    const earlyTuesday = krsk('2026-10-20T02:00:00');
    expect(dayAt(earlyTuesday, 1, '08:00').toISOString()).toBe(iso('2026-10-21T08:00:00'));
  });

  describe('«ближайший день недели» — начало не раньше чем через 3 часа', () => {
    const wednesday = 3;

    it('сброс во вторник в 10:00 — «Футбол» завтра в 19:00', () => {
      expect(
        nearestWeekdayAt(krsk('2026-10-20T10:00:00'), [wednesday], '19:00').toISOString(),
      ).toBe(iso('2026-10-21T19:00:00'));
    });

    it('сброс в среду в 17:00 — «Футбол» через неделю: до 19:00 меньше 3 часов', () => {
      expect(
        nearestWeekdayAt(krsk('2026-10-21T17:00:00'), [wednesday], '19:00').toISOString(),
      ).toBe(iso('2026-10-28T19:00:00'));
    });

    it('ровно 3 часа до начала — ещё сегодня', () => {
      expect(
        nearestWeekdayAt(krsk('2026-10-21T16:00:00'), [wednesday], '19:00').toISOString(),
      ).toBe(iso('2026-10-21T19:00:00'));
    });

    it('«ближайший вторник или четверг» — тот, что раньше', () => {
      const tuesdayOrThursday = [2, 4];
      expect(
        nearestWeekdayAt(krsk('2026-10-19T10:00:00'), tuesdayOrThursday, '07:30').toISOString(),
      ).toBe(iso('2026-10-20T07:30:00'));
      expect(
        nearestWeekdayAt(krsk('2026-10-20T06:00:00'), tuesdayOrThursday, '07:30').toISOString(),
      ).toBe(iso('2026-10-22T07:30:00'));
    });

    it('«ближайшая суббота» с понедельника', () => {
      expect(nearestWeekdayAt(mondayMorning, [6], '12:00').toISOString()).toBe(
        iso('2026-10-24T12:00:00'),
      );
    });
  });
});

describe('начало и окончание мероприятия — в один календарный день', () => {
  // Окна, где до начала меньше 3 часов, а до окончания — больше: сброс раньше падал
  it.each([
    ['среда 17:00, «Футбол» по средам 19:00–20:30', '2026-10-21T17:00:00', [3], '19:00', '20:30'],
    ['суббота 10:00, «Блиц» по субботам 12:00–15:00', '2026-10-24T10:00:00', [6], '12:00', '15:00'],
    ['воскресенье 9:00, «Шахматы» 11:00–12:30', '2026-10-25T09:00:00', [0], '11:00', '12:30'],
    ['вторник 4:45, «Зарядка» вт/чт 7:30–8:00', '2026-10-20T04:45:00', [2, 4], '07:30', '08:00'],
  ])('%s', (_name, local, weekdays, from, to) => {
    const now = krsk(local);
    const { startsAt, endsAt } = eventTimes(now, { weekdays, from, to });
    expect(startsAt.getTime() - now.getTime()).toBeGreaterThanOrEqual(3 * 3_600_000);
    expect(endsAt.getTime()).toBeGreaterThan(startsAt.getTime());
    expect(dayAt(endsAt, 0, '00:00')).toEqual(dayAt(startsAt, 0, '00:00'));
  });

  it('для «через N дней» — тот же день, время окончания из таблицы', () => {
    const { startsAt, endsAt } = eventTimes(krsk('2026-10-19T10:00:00'), {
      days: -12,
      from: '05:30',
      to: '06:30',
    });
    expect(startsAt.toISOString()).toBe(iso('2026-10-07T05:30:00'));
    expect(endsAt.toISOString()).toBe(iso('2026-10-07T06:30:00'));
  });
});
