import { describe, expect, it } from 'vitest';
import { displayStatus } from '../src';
import type { DisplayStatusEvent } from '../src';

const now = new Date('2026-10-19T10:00:00Z');

const event = (overrides: Partial<DisplayStatusEvent> = {}): DisplayStatusEvent => ({
  status: 'published',
  startsAt: new Date('2026-10-21T10:00:00Z'),
  endsAt: new Date('2026-10-21T12:00:00Z'),
  capacity: 10,
  previousStartsAt: null,
  ...overrides,
});

describe('displayStatus', () => {
  it('опубликовано, места есть — «Набор открыт»', () => {
    expect(displayStatus(event(), now, 3)).toBe('open');
  });

  it('без лимита мест — всегда «Набор открыт»', () => {
    expect(displayStatus(event({ capacity: null }), now, 500)).toBe('open');
  });

  it('все места заняты — «Мест нет»', () => {
    expect(displayStatus(event({ capacity: 10 }), now, 10)).toBe('full');
  });

  it('последнее свободное место — ещё «Набор открыт»', () => {
    expect(displayStatus(event({ capacity: 10 }), now, 9)).toBe('open');
  });

  it('перенесённое до начала — «Перенесено», даже если мест нет', () => {
    const rescheduled = event({ previousStartsAt: new Date('2026-10-20T10:00:00Z') });
    expect(displayStatus(rescheduled, now, 0)).toBe('rescheduled');
    expect(displayStatus(rescheduled, now, 10)).toBe('rescheduled');
  });

  it('с момента начала и до окончания — «Идёт»', () => {
    const e = event({ startsAt: now, endsAt: new Date('2026-10-19T12:00:00Z') });
    expect(displayStatus(e, now, 10)).toBe('ongoing');
    expect(displayStatus(e, new Date('2026-10-19T12:00:00Z'), 10)).toBe('ongoing');
  });

  it('перенесённое и уже начавшееся — «Идёт»', () => {
    const e = event({
      startsAt: new Date('2026-10-19T09:00:00Z'),
      endsAt: new Date('2026-10-19T11:00:00Z'),
      previousStartsAt: new Date('2026-10-18T09:00:00Z'),
    });
    expect(displayStatus(e, now, 1)).toBe('ongoing');
  });

  it('после окончания (ends_at < now) — «Завершено»', () => {
    const e = event({
      startsAt: new Date('2026-10-19T08:00:00Z'),
      endsAt: new Date('2026-10-19T09:59:59.999Z'),
    });
    expect(displayStatus(e, now, 10)).toBe('finished');
  });

  it('хранимые статусы важнее времени и мест', () => {
    const past = {
      startsAt: new Date('2026-10-18T08:00:00Z'),
      endsAt: new Date('2026-10-18T09:00:00Z'),
    };
    for (const status of ['cancelled', 'unpublished', 'deleted'] as const) {
      expect(displayStatus(event({ status }), now, 10), status).toBe(status);
      expect(displayStatus(event({ status, ...past }), now, 10), `${status} в прошлом`).toBe(
        status,
      );
    }
  });
});
