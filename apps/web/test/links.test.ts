import { describe, expect, it } from 'vitest';
import { linkHost, linkLabel } from '../src/shared/links';

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

describe('linkLabel — подпись внешней ссылки', () => {
  it('хост и путь, без протокола и данных входа', () => {
    expect(linkLabel('https://vk.com/club')).toBe('vk.com/club');
    expect(linkLabel('https://padel.example')).toBe('padel.example');
    expect(linkLabel('https://user:pass@evil.com/x?y=1')).toBe('evil.com/x?y=1');
    expect(linkLabel('https://vк.com/club')).toBe('xn--v-ttb.com/club');
    expect(linkLabel('javascript:alert(1)')).toBeNull();
  });
});
