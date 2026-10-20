import { describe, expect, it } from 'vitest';
import { PARTICIPATION_GROUP_TITLES, participationGroup } from '../src';

describe('participationGroup: группы «Моих записей»', () => {
  it('заявка на рассмотрении — «Ждут решения»', () => {
    expect(participationGroup('pending', 'open')).toBe('pending');
    expect(participationGroup('pending', 'full')).toBe('pending');
  });

  it('участник, лист ожидания, отказ и отмена до конца мероприятия — «Предстоящие»', () => {
    for (const status of ['confirmed', 'waitlist', 'rejected', 'cancelled'] as const) {
      expect(participationGroup(status, 'open'), status).toBe('upcoming');
    }
  });

  it('идущее и перенесённое — «Предстоящие»', () => {
    expect(participationGroup('confirmed', 'ongoing')).toBe('upcoming');
    expect(participationGroup('confirmed', 'rescheduled')).toBe('upcoming');
  });

  it('завершённое, отменённое организатором и снятое модератором — «Прошедшие»', () => {
    for (const event of ['finished', 'cancelled', 'unpublished', 'deleted'] as const) {
      expect(participationGroup('confirmed', event), event).toBe('past');
      expect(participationGroup('pending', event), event).toBe('past');
    }
  });

  it('названия групп — как в ТЗ', () => {
    expect(PARTICIPATION_GROUP_TITLES).toEqual({
      upcoming: 'Предстоящие',
      pending: 'Ждут решения',
      past: 'Прошедшие',
    });
  });
});
