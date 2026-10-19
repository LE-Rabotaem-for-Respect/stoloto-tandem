import {
  DEMO_ACCOUNT_KEYS,
  cleanSportName,
  isValidSportName,
  normalizeSportName,
} from '@tandem/domain';
import { describe, expect, it } from 'vitest';
import { SEED_ACCOUNTS, SEED_SPORTS } from '../src/modules/demo/seed-data';

describe('данные минимального сида', () => {
  it('аккаунты — ровно демо-аккаунты быстрого входа (ТЗ 4.6)', () => {
    expect(SEED_ACCOUNTS.map((account) => account.key)).toEqual([...DEMO_ACCOUNT_KEYS]);
  });

  it('роли и статусы организаций по ТЗ 4.6', () => {
    const byKey = Object.fromEntries(SEED_ACCOUNTS.map((account) => [account.key, account]));
    expect(byKey.admin?.role).toBe('admin');
    for (const key of ['anna', 'igor', 'petr']) expect(byKey[key]?.role, key).toBe('user');
    expect(byKey.ladya?.organization?.status).toBe('approved');
    expect(byKey.padel?.organization?.status).toBe('pending');
    expect(byKey.stolby?.organization?.status).toBe('pending');
    expect(byKey.yoga?.organization?.status).toBe('rejected');
    expect(byKey.yoga?.organization?.decisionReason).toBe('Не указаны контакты представителя');
    for (const key of ['ladya', 'padel', 'stolby', 'yoga']) {
      expect(byKey[key]?.role, key).toBe('org');
    }
  });

  it('Пётр Иванович — с включённым крупным текстом', () => {
    const petr = SEED_ACCOUNTS.find((account) => account.key === 'petr');
    expect(petr?.settings).toEqual({ text: 'large' });
  });

  it('каталог — около 25 направлений во всех 8 группах (ТЗ 2.3)', () => {
    expect(SEED_SPORTS.length).toBeGreaterThanOrEqual(23);
    expect(SEED_SPORTS.length).toBeLessThanOrEqual(28);
    expect(new Set(SEED_SPORTS.map((sport) => sport.category))).toEqual(
      new Set([
        'team',
        'endurance',
        'intellectual',
        'martial',
        'fitness',
        'water',
        'winter',
        'other',
      ]),
    );
  });

  it('в каталоге массовые, интеллектуальные, бытовые и нишевые направления из ТЗ', () => {
    const names = SEED_SPORTS.map((sport) => sport.name);
    for (const name of ['Футбол', 'Бег', 'Шахматы', 'Зарядка', 'Скалолазание', 'Фрисби']) {
      expect(names, name).toContain(name);
    }
  });

  it('названия и синонимы не дублируют друг друга после нормализации', () => {
    const all = SEED_SPORTS.flatMap((sport) => [sport.name, ...sport.aliases]).map(
      normalizeSportName,
    );
    expect(new Set(all).size).toBe(all.length);
  });

  it('названия и синонимы проходят правило названия направления', () => {
    for (const name of SEED_SPORTS.flatMap((sport) => [sport.name, ...sport.aliases])) {
      expect(isValidSportName(name), name).toBe(true);
      expect(cleanSportName(name), name).toBe(name);
    }
  });

  it('группы направлений демо-мероприятий — как в docs/scenarios.md', () => {
    const category = (name: string) => SEED_SPORTS.find((sport) => sport.name === name)?.category;
    expect(category('Фрисби')).toBe('team');
    expect(category('Скалолазание')).toBe('endurance');
    expect(category('Зарядка')).toBe('fitness');
    expect(SEED_SPORTS.find((sport) => sport.name === 'Зарядка')?.aliases).toContain(
      'зарядка во дворе',
    );
  });

  it('«Кёрлинг» — не в каталоге: его добавляют в сценарии 1', () => {
    const all = SEED_SPORTS.flatMap((sport) => [sport.name, ...sport.aliases]).map(
      normalizeSportName,
    );
    expect(all.some((name) => name.includes('керлинг'))).toBe(false);
  });

  it('«Петанк» — не в каталоге: его добавляет пользователь (ТЗ 4.6)', () => {
    expect(SEED_SPORTS.map((sport) => normalizeSportName(sport.name))).not.toContain('петанк');
  });
});
