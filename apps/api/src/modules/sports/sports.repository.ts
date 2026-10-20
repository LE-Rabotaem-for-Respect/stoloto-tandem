import { Injectable } from '@nestjs/common';
import type { SportCategory } from '@tandem/domain';
import { escapeLike } from '../../core/prisma/like';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma, Sport, SportStatus } from '../../generated/prisma/client';

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

export interface AdminSportFilter {
  /** Запрос, нормализованный как имена направлений. */
  normalizedText?: string;
  status?: SportStatus;
  custom?: boolean;
}

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

  findActiveById(id: string, tx?: Db): Promise<Sport | null> {
    return (tx ?? this.prisma).sport.findFirst({ where: { id, status: 'active' } });
  }

  /** Каталог для администратора: все статусы, по имени или прежнему имени, по алфавиту. */
  async adminSearch(
    filter: AdminSportFilter,
    page: { offset: number; limit: number },
  ): Promise<{ sports: Sport[]; total: number }> {
    const where: Prisma.SportWhereInput = {
      ...(filter.status && { status: filter.status }),
      ...(filter.custom !== undefined && { isCustom: filter.custom }),
      ...(filter.normalizedText && {
        OR: [
          { normalizedName: { contains: escapeLike(filter.normalizedText) } },
          { aliases: { has: filter.normalizedText } },
        ],
      }),
    };
    const [sports, total] = await Promise.all([
      this.prisma.sport.findMany({
        where,
        orderBy: [{ normalizedName: 'asc' }],
        skip: page.offset,
        take: page.limit,
      }),
      this.prisma.sport.count({ where }),
    ]);
    return { sports, total };
  }

  findById(id: string, tx?: Db): Promise<Sport | null> {
    return (tx ?? this.prisma).sport.findUnique({ where: { id } });
  }

  /** Направления под блокировкой строк: два объединения с одним направлением идут по очереди. */
  async lock(ids: readonly string[], tx: Db): Promise<Sport[]> {
    await tx.$queryRaw`SELECT "id" FROM "sports" WHERE "id" = ANY (${[...ids]}::uuid[]) FOR UPDATE`;
    return tx.sport.findMany({ where: { id: { in: [...ids] } } });
  }

  update(id: string, data: Prisma.SportUpdateInput, tx?: Db): Promise<Sport> {
    return (tx ?? this.prisma).sport.update({ where: { id }, data });
  }

  transaction<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(work);
  }

  /**
   * Ссылки на направление в данных пользователя — «Мои направления», аксессуары
   * Хелфигочи, запросы «Ищу компанию» — при объединении (DECISION-003). У этих таблиц
   * пока нет своего модуля. Где у человека уже есть целевое, старая строка удаляется.
   */
  async moveUserReferences(fromId: string, toId: string, tx: Db): Promise<void> {
    const sportUsers = await tx.userSport.findMany({
      where: { sportId: toId },
      select: { userId: true },
    });
    await tx.userSport.deleteMany({
      where: { sportId: fromId, userId: { in: sportUsers.map((row) => row.userId) } },
    });
    await tx.userSport.updateMany({ where: { sportId: fromId }, data: { sportId: toId } });

    const accessories = await tx.userAccessory.findMany({
      where: { sportId: toId },
      select: { userId: true, accessoryId: true },
    });
    if (accessories.length > 0) {
      await tx.userAccessory.deleteMany({
        where: {
          sportId: fromId,
          OR: accessories.map(({ userId, accessoryId }) => ({ userId, accessoryId })),
        },
      });
    }
    await tx.userAccessory.updateMany({ where: { sportId: fromId }, data: { sportId: toId } });
    await tx.companyRequest.updateMany({ where: { sportId: fromId }, data: { sportId: toId } });
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
