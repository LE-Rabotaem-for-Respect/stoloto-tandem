import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaService } from '../src/core/prisma/prisma.service';
import { SportsRepository } from '../src/modules/sports/sports.repository';
import { SportsService } from '../src/modules/sports/sports.service';
import { createUser, prisma } from './db';

const repository = new SportsRepository(prisma as unknown as PrismaService);
const service = new SportsService(repository);

// Уникальное слово на прогон: база общая для файлов, и чужие направления не должны мешать
const tag = `тест${randomUUID().slice(0, 8)}`;

let authorId: string;

beforeAll(async () => {
  authorId = (await createUser()).id;
  await prisma.sport.createMany({
    data: [
      { name: `Бег ${tag}`, normalizedName: `бег ${tag}`, category: 'endurance' },
      {
        name: `Альпинизм ${tag}`,
        normalizedName: `альпинизм ${tag}`,
        aliases: [`скалолазание в горах ${tag}`],
        category: 'endurance',
      },
      { name: `Аэробег ${tag}`, normalizedName: `аэробег ${tag}`, category: 'fitness' },
      { name: `Скрытый ${tag}`, normalizedName: `скрытый ${tag}`, status: 'hidden' },
      { name: `Сто_процентов ${tag}`, normalizedName: `сто_процентов ${tag}` },
    ],
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

const names = (result: { items: { name: string }[] }) => result.items.map((item) => item.name);

describe('поиск направлений', () => {
  it('находит по части имени, сначала совпадения с начала', async () => {
    const result = await service.search(`БЕГ ${tag}`);
    expect(names(result)).toEqual([`Бег ${tag}`, `Аэробег ${tag}`]);
    expect(result.exactMatch).toBe(true);

    expect(names(await service.search(`аэро`))).toEqual([`Аэробег ${tag}`]);
  });

  it('находит по алиасу и по его части', async () => {
    expect(names(await service.search(`скалолазание в горах ${tag}`))).toEqual([
      `Альпинизм ${tag}`,
    ]);
    const partial = await service.search(`в горах ${tag}`);
    expect(names(partial)).toEqual([`Альпинизм ${tag}`]);
    expect(partial.exactMatch).toBe(false);
  });

  it('не показывает скрытые направления', async () => {
    const result = await service.search(`скрытый ${tag}`);
    expect(result).toEqual({ items: [], exactMatch: false });
  });

  it('% и _ в запросе — обычные символы', async () => {
    expect(names(await service.search(`%${tag}`))).toEqual([]);
    expect(names(await service.search(`сто_п`))).toEqual([`Сто_процентов ${tag}`]);
    expect(names(await service.search(`стоxп`))).toEqual([]);
  });

  it('соблюдает лимит', async () => {
    expect((await service.search(tag, 2)).items).toHaveLength(2);
  });
});

describe('новое направление', () => {
  it('«Падел», «падел » и «ПАДЕЛ» дают одну запись', async () => {
    const first = await service.findOrCreate({ name: `Падел ${tag}` }, authorId);
    const second = await service.findOrCreate({ name: `падел  ${tag} ` }, authorId);
    const third = await service.findOrCreate({ name: `ПАДЕЛ ${tag.toUpperCase()}` }, authorId);

    expect(second.id).toBe(first.id);
    expect(third.id).toBe(first.id);
    expect(await prisma.sport.count({ where: { normalizedName: `падел ${tag}` } })).toBe(1);
    expect(first).toMatchObject({ isCustom: true, category: 'other', createdById: authorId });
  });

  it('ё и е — одно направление', async () => {
    const first = await service.findOrCreate({ name: `Кёрлинг ${tag}` }, authorId);
    const second = await service.findOrCreate({ name: `керлинг ${tag}` }, authorId);
    expect(second.id).toBe(first.id);
    expect(first.name).toBe(`Кёрлинг ${tag}`);
  });

  it('по алиасу находит существующее направление', async () => {
    const found = await service.findOrCreate({ name: `Скалолазание в горах ${tag}` }, authorId);
    expect(found.name).toBe(`Альпинизм ${tag}`);
  });

  it('сразу доступно в поиске, с выбранной группой', async () => {
    await service.findOrCreate({ name: `Петанк ${tag}`, category: 'team' }, authorId);
    const result = await service.search(`петанк ${tag}`);
    expect(result.items).toEqual([
      { id: expect.any(String), name: `Петанк ${tag}`, category: 'team', isCustom: true },
    ]);
    expect(result.exactMatch).toBe(true);
  });

  it('скрытое направление с тем же именем используется повторно', async () => {
    const found = await service.findOrCreate({ name: `скрытый  ${tag}` }, authorId);
    expect(found).toMatchObject({ name: `Скрытый ${tag}`, status: 'hidden' });
    expect(await prisma.sport.count({ where: { normalizedName: `скрытый ${tag}` } })).toBe(1);
  });

  it('вставка уже существующего имени возвращает запись, не падая и не прерывая транзакцию', async () => {
    const record = {
      name: `Сквош ${tag}`,
      normalizedName: `сквош ${tag}`,
      category: 'other' as const,
      createdById: authorId,
    };
    const first = await repository.createCustom(record);
    const [second, count] = await prisma.$transaction(async (tx) => {
      const txRepository = new SportsRepository(tx as unknown as PrismaService);
      const again = await txRepository.createCustom({ ...record, name: `СКВОШ ${tag}` });
      return [again, await tx.sport.count({ where: { normalizedName: record.normalizedName } })];
    });
    expect(second.id).toBe(first.id);
    expect(second.name).toBe(`Сквош ${tag}`);
    expect(count).toBe(1);
  });

  it('одновременное создание одного названия не даёт дублей', async () => {
    const created = await Promise.all(
      Array.from({ length: 5 }, () => service.findOrCreate({ name: `Фрисби ${tag}` }, authorId)),
    );
    expect(new Set(created.map((sport) => sport.id)).size).toBe(1);
    expect(await prisma.sport.count({ where: { normalizedName: `фрисби ${tag}` } })).toBe(1);
  });
});
