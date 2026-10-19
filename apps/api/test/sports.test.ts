import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DEFAULT_SPORT_CATEGORY, SPORT_CATEGORIES, SPORT_CATEGORY_TITLES } from '@tandem/domain';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { ClockStateSource } from '../src/core/clock';
import { ApiError } from '../src/core/errors';
import { SportCategory } from '../src/generated/prisma/client';
import type { Sport } from '../src/generated/prisma/client';
import { SportsRepository } from '../src/modules/sports/sports.repository';
import type { NewSportRecord, SportSearchRow } from '../src/modules/sports/sports.repository';
import { SportsService } from '../src/modules/sports/sports.service';

function sport(overrides: Partial<Sport> & Pick<Sport, 'name' | 'normalizedName'>): Sport {
  return {
    id: `id-${overrides.normalizedName}`,
    aliases: [],
    category: 'other',
    isCustom: false,
    createdById: null,
    status: 'active',
    ...overrides,
  };
}

/** Каталог в памяти: поиск в базе проверяют тесты test-db, здесь — логика сервиса. */
class FakeSportsRepository {
  sports: Sport[] = [];
  searches: { query: string; limit: number }[] = [];

  async search(query: string, limit: number): Promise<SportSearchRow[]> {
    this.searches.push({ query, limit });
    return this.sports
      .filter(
        (s) =>
          s.status === 'active' &&
          [s.normalizedName, ...s.aliases].some((name) => name.includes(query)),
      )
      .slice(0, limit)
      .map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        isCustom: s.isCustom,
        exact: s.normalizedName === query || s.aliases.includes(query),
      }));
  }

  async findByName(normalizedName: string) {
    return (
      this.sports.find((s) => s.normalizedName === normalizedName) ??
      this.sports.find((s) => s.status === 'active' && s.aliases.includes(normalizedName)) ??
      null
    );
  }

  // Как ON CONFLICT DO NOTHING в базе: при совпадении имени возвращается существующая запись
  async createCustom(record: NewSportRecord) {
    const existing = this.sports.find((s) => s.normalizedName === record.normalizedName);
    if (existing) return existing;
    const created = sport({ ...record, isCustom: true });
    this.sports.push(created);
    return created;
  }
}

describe('группы направлений', () => {
  it('совпадают с enum базы и у каждой есть название', () => {
    expect([...SPORT_CATEGORIES].sort()).toEqual(Object.values(SportCategory).sort());
    expect(Object.keys(SPORT_CATEGORY_TITLES).sort()).toEqual([...SPORT_CATEGORIES].sort());
    expect(DEFAULT_SPORT_CATEGORY).toBe('other');
  });
});

describe('SportsService', () => {
  let repository: FakeSportsRepository;
  let service: SportsService;

  beforeEach(() => {
    repository = new FakeSportsRepository();
    repository.sports = [
      sport({ name: 'Падел', normalizedName: 'падел', category: 'team' }),
      sport({ name: 'Футбол', normalizedName: 'футбол', aliases: ['соккер'], category: 'team' }),
      sport({ name: 'Ёрш', normalizedName: 'ерш', status: 'hidden' }),
    ];
    service = new SportsService(repository as unknown as SportsRepository);
  });

  describe('поиск', () => {
    it('ищет по нормализованному запросу', async () => {
      const result = await service.search('  ПАД  ');
      expect(repository.searches).toEqual([{ query: 'пад', limit: 10 }]);
      expect(result).toEqual({
        items: [{ id: 'id-падел', name: 'Падел', category: 'team', isCustom: false }],
        exactMatch: false,
      });
    });

    it('сообщает о точном совпадении, в том числе по алиасу', async () => {
      expect((await service.search('Падел ')).exactMatch).toBe(true);
      expect((await service.search('Соккер')).exactMatch).toBe(true);
    });

    it('пустой запрос — без точного совпадения', async () => {
      expect((await service.search('   ')).exactMatch).toBe(false);
    });
  });

  describe('новое направление', () => {
    it('«падел » и «ПАДЕЛ» находят существующее, дубль не создаётся', async () => {
      for (const name of ['падел ', 'ПАДЕЛ', '  Падел']) {
        await expect(service.findOrCreate({ name }, 'user-1')).resolves.toMatchObject({
          id: 'id-падел',
        });
      }
      expect(repository.sports).toHaveLength(3);
    });

    it('находит существующее по алиасу', async () => {
      await expect(service.findOrCreate({ name: 'Соккер' }, 'user-1')).resolves.toMatchObject({
        id: 'id-футбол',
      });
    });

    it('создаёт пользовательское направление с группой «другое» по умолчанию', async () => {
      const created = await service.findOrCreate({ name: '  Кёрлинг   на льду ' }, 'user-1');
      expect(created).toMatchObject({
        name: 'Кёрлинг на льду',
        normalizedName: 'керлинг на льду',
        category: 'other',
        isCustom: true,
        createdById: 'user-1',
      });
    });

    it('сохраняет выбранную группу', async () => {
      const created = await service.findOrCreate({ name: 'Кёрлинг', category: 'winter' }, 'u');
      expect(created.category).toBe('winter');
    });

    it('скрытое направление с тем же именем используется повторно', async () => {
      await expect(service.findOrCreate({ name: 'ёрш' }, 'user-1')).resolves.toMatchObject({
        id: 'id-ерш',
        status: 'hidden',
      });
      expect(repository.sports).toHaveLength(3);
    });

    it('отклоняет название короче двух символов после нормализации', async () => {
      await expect(service.findOrCreate({ name: '  a   ' }, 'user-1')).rejects.toBeInstanceOf(
        ApiError,
      );
    });
  });
});

describe('GET /sports', () => {
  let app: INestApplication;
  const repository = new FakeSportsRepository();

  beforeAll(async () => {
    process.env.DATABASE_URL ??= 'postgresql://unused@127.0.0.1:1/unused';
    repository.sports = [sport({ name: 'Скалолазание', normalizedName: 'скалолазание' })];
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SportsRepository)
      .useValue(repository)
      .overrideProvider(ClockStateSource)
      .useValue({ read: async () => ({ offsetSeconds: 0, lastResetAt: null }) })
      .compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('отдаёт подсказки и признак точного совпадения', async () => {
    const response = await request(app.getHttpServer()).get('/sports').query({ q: 'скало' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [{ id: 'id-скалолазание', name: 'Скалолазание', category: 'other', isCustom: false }],
      exactMatch: false,
    });
  });

  it('передаёт лимит числом', async () => {
    repository.searches = [];
    await request(app.getHttpServer()).get('/sports').query({ q: 'с', limit: '3' });
    expect(repository.searches).toEqual([{ query: 'с', limit: 3 }]);
  });

  it('отклоняет неверный лимит понятной ошибкой', async () => {
    const response = await request(app.getHttpServer()).get('/sports').query({ limit: '0' });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      code: 'validation_failed',
      message: 'Проверьте поля формы',
      fields: { limit: 'Лимит — от 1 до 100' },
    });
  });
});
