import { describe, expect, it } from 'vitest';
import { linkHost } from '../src/shared/links';

describe('linkHost — хост внешней ссылки для показа', () => {
  it('обычная ссылка — её хост', () => {
    expect(linkHost('https://vk.com/club')).toBe('vk.com');
  });

  it('домен-двойник с кириллической буквой — в punycode, подмену видно', () => {
    expect(linkHost('https://vк.com/club')).toBe('xn--v-ttb.com');
  });

  it('данные входа не попадают в показ: виден настоящий хост', () => {
    expect(linkHost('https://vk.com@evil.com/club')).toBe('evil.com');
    expect(linkHost('https://user:pass@evil.com')).toBe('evil.com');
  });

  it('не http(s) и не ссылка — не показываем', () => {
    expect(linkHost('javascript:alert(1)')).toBeNull();
    expect(linkHost('не ссылка')).toBeNull();
  });
});
