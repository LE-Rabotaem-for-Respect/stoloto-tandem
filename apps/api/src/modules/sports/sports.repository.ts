import { Injectable } from '@nestjs/common';
import type { SportCategory } from '@tandem/domain';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { Sport } from '../../generated/prisma/client';

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

  /** Направление с таким нормализованным именем, а если его нет — активное с таким алиасом. */
  async findByName(normalizedName: string): Promise<Sport | null> {
    const byName = await this.prisma.sport.findUnique({ where: { normalizedName } });
    if (byName) return byName;
    return this.prisma.sport.findFirst({
      where: { aliases: { has: normalizedName }, status: 'active' },
      orderBy: { normalizedName: 'asc' },
    });
  }

  /**
   * Новое пользовательское направление. Если то же имя одновременно добавил другой
   * запрос, возвращается его запись: вставка идёт с ON CONFLICT DO NOTHING, поэтому
   * не падает на уникальности и не прерывает транзакцию, в которой её вызвали.
   */
  async createCustom(record: NewSportRecord): Promise<Sport> {
    await this.prisma.sport.createMany({
      data: { ...record, isCustom: true },
      skipDuplicates: true,
    });
    return this.prisma.sport.findUniqueOrThrow({
      where: { normalizedName: record.normalizedName },
    });
  }
}
