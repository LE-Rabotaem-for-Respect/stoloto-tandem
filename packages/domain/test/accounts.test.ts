import { describe, expect, it } from 'vitest';
import {
  DEMO_ACCOUNTS,
  DEMO_ACCOUNT_KEYS,
  demoAccountEmail,
  isDemoEmail,
  normalizeEmail,
} from '../src';

describe('normalizeEmail', () => {
  it('обрезает пробельные символы по краям и приводит к нижнему регистру', () => {
    expect(normalizeEmail('  Anna@Example.RU\t\n')).toBe('anna@example.ru');
  });
});

describe('демо-аккаунты', () => {
  it('быстрый вход — восемь аккаунтов ТЗ 4.6 с уникальными ключами', () => {
    expect(DEMO_ACCOUNT_KEYS).toEqual([
      'anna',
      'igor',
      'petr',
      'ladya',
      'padel',
      'stolby',
      'yoga',
      'admin',
    ]);
    expect(new Set(DEMO_ACCOUNT_KEYS).size).toBe(DEMO_ACCOUNTS.length);
  });

  it('почта демо-аккаунта — ключ в домене demo', () => {
    expect(demoAccountEmail('anna')).toBe('anna@demo');
    expect(demoAccountEmail('admin')).toBe('admin@demo');
  });

  it('распознаёт демо-почту в любом регистре и с пробелами', () => {
    expect(isDemoEmail('anna@demo')).toBe(true);
    expect(isDemoEmail(' Maria@DEMO ')).toBe(true);
    expect(isDemoEmail('anna@demo.ru')).toBe(false);
    expect(isDemoEmail('demo@example.ru')).toBe(false);
  });
});
