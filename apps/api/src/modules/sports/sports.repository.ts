import { Injectable } from '@nestjs/common';
import type { SportCategory } from '@tandem/domain';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma, Sport } from '../../generated/prisma/client';

/** Клиент базы: обычный или транзакции, в которой вызван метод. */
export type Db = Prisma.TransactionClient;

export interface SportSearchRow {
  id: string;
  name: string;
  category: SportCategory;
  isCustom: boolean;
  /** Запрос совпал с именем или алиасом целиком. */
  exact: boolean;
}

export interface NewSportRecord {
  name: string;
  normalizedName: string;
  category: SportCategory;
  createdById: string;
}

// В LIKE символы % и _ из запроса — обычные буквы, а не шаблон
const escapeLike = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`);

@Injectable()
export class SportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Активные направления, у которых имя или алиас содержит `query` (уже нормализованный).
   * Сначала точные совпадения, затем совпадения с начала слова, затем по алфавиту.
   */
  search(query: string, limit: number): Promise<SportSearchRow[]> {
    const contains = `%${escapeLike(query)}%`;
    const prefix = `${escapeLike(query)}%`;
    return this.prisma.$queryRaw<SportSearchRow[]>`
      SELECT s."id", s."name", s."category"::text AS "category", s."is_custom" AS "isCustom",
        (s."normalized_name" = ${query} OR ${query} = ANY (s."aliases")) AS "exact"
      FROM "sports" s
      WHERE s."status" = 'active'
        AND (s."normalized_name" LIKE ${contains}
          OR EXISTS (SELECT 1 FROM unnest(s."aliases") AS a WHERE a LIKE ${contains}))
      ORDER BY "exact" DESC,
        (s."normalized_name" LIKE ${prefix}
          OR EXISTS (SELECT 1 FROM unnest(s."aliases") AS a WHERE a LIKE ${prefix})) DESC,
        s."normalized_name"
      LIMIT ${limit}::int`;
  }

  /**
   * Направление, которое пользователь имел в виду, по нормализованному имени.
   * Порядок: активное по имени → активное по алиасу → любое по имени → любое по алиасу.
   * Так после объединения дублей старое имя (алиас) ведёт к активному направлению,
   * а имя или алиас скрытого не создаётся заново как новое активное.
   */
  async findByName(normalizedName: string, tx?: Db): Promise<Sport | null> {
    const db = tx ?? this.prisma;
    const candidates = await db.sport.findMany({
      where: { OR: [{ normalizedName }, { aliases: { has: normalizedName } }] },
      orderBy: { normalizedName: 'asc' },
    });
    const rank = (sport: Sport) =>
      (sport.status === 'active' ? 0 : 2) + (sport.normalizedName === normalizedName ? 0 : 1);
    return candidates.sort((a, b) => rank(a) - rank(b))[0] ?? null;
  }

  /** Сколько из этих направлений есть в каталоге и не скрыты. */
  countActive(ids: readonly string[]): Promise<number> {
    return this.prisma.sport.count({ where: { id: { in: [...ids] }, status: 'active' } });
  }

  /**
   * Новое пользовательское направление. Если то же имя одновременно добавил другой
   * запрос, возвращается его запись: вставка идёт с ON CONFLICT DO NOTHING, поэтому
   * не падает на уникальности и не прерывает транзакцию, в которой её вызвали.
   */
  async createCustom(record: NewSportRecord, tx?: Db): Promise<Sport> {
    const db = tx ?? this.prisma;
    await db.sport.createMany({ data: { ...record, isCustom: true }, skipDuplicates: true });
    return db.sport.findUniqueOrThrow({ where: { normalizedName: record.normalizedName } });
  }
}
