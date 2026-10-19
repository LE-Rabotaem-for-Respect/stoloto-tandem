import { describe, expect, it } from 'vitest';
import { TIME_ZONE } from '../src';

describe('TIME_ZONE', () => {
  it('известен среде выполнения', () => {
    const format = new Intl.DateTimeFormat('ru-RU', { timeZone: TIME_ZONE, hour: '2-digit' });
    // 2026-10-19 00:00 UTC — 07:00 в Красноярске (UTC+7, без перехода на летнее время)
    expect(format.format(new Date('2026-10-19T00:00:00Z'))).toBe('07');
  });
});
