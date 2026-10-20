import { Injectable } from '@nestjs/common';
import type { EventLevel, EventMode, ParticipationStatus, SportCategory } from '@tandem/domain';
import { escapeLike } from '../../core/prisma/like';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

type Db = Prisma.TransactionClient;

const cardInclude = {
  sport: { select: { id: true, name: true, category: true, isCustom: true, status: true } },
  organizerUser: { select: { id: true, name: true } },
  organizerOrg: { select: { id: true, name: true } },
} satisfies Prisma.EventInclude;

export type EventWithCard = Prisma.EventGetPayload<{ include: typeof cardInclude }>;

/** Фильтры ленты уже в терминах модели; что они значат для человека — решает сервис. */
export interface FeedFilter {
  /** Не завершённые к этому моменту. */
  now: Date;
  /** Текст как ввёл человек — для названия и описания. */
  text?: string;
  /** Тот же текст, нормализованный как имена направлений. */
  sportText?: string;
  sportId?: string;
  category?: SportCategory;
  startsFrom?: Date;
  startsBefore?: Date;
  city?: string;
  area?: string;
  /** Уровни, которые подходят: выбранный и «Любой». */
  levels?: EventLevel[];
  mode?: EventMode;
}

// Prisma строит и equals без учёта регистра, и contains через ILIKE: ввод экранируется
const insensitive = (value: string) => ({
  equals: escapeLike(value),
  mode: 'insensitive' as const,
});

function feedWhere(filter: FeedFilter): Prisma.EventWhereInput {
  const and: Prisma.EventWhereInput[] = [{ status: 'published' }, { endsAt: { gt: filter.now } }];
  if (filter.text !== undefined) {
    const contains = { contains: escapeLike(filter.text), mode: 'insensitive' as const };
    and.push({
      OR: [
        { title: contains },
        { description: contains },
        // Скрытое направление не ищется по названию: оно не показывается
        {
          sport: {
            status: 'active',
            OR: [
              { normalizedName: { contains: escapeLike(filter.sportText ?? '') } },
              { aliases: { has: filter.sportText ?? '' } },
            ],
          },
        },
      ],
    });
  }
  if (filter.sportId) and.push({ sportId: filter.sportId });
  if (filter.category === 'other') {
    // Мероприятие со скрытым направлением показывается в группе «Другое» (ТЗ 2.3)
    and.push({ sport: { OR: [{ category: 'other' }, { status: 'hidden' }] } });
  } else if (filter.category) {
    and.push({ sport: { category: filter.category, status: 'active' } });
  }
  if (filter.startsFrom) and.push({ startsAt: { gte: filter.startsFrom } });
  if (filter.startsBefore) and.push({ startsAt: { lt: filter.startsBefore } });
  if (filter.city) and.push({ city: insensitive(filter.city) });
  if (filter.area) and.push({ area: insensitive(filter.area) });
  if (filter.levels) and.push({ level: { in: filter.levels } });
  if (filter.mode) and.push({ mode: filter.mode });
  return { AND: and };
}

@Injectable()
export class EventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(work);
  }

  create(data: Prisma.EventUncheckedCreateInput, tx: Db): Promise<{ id: string }> {
    return tx.event.create({ data, select: { id: true } });
  }

  /** Название и кто организатор: пользователь или владелец организации-организатора. */
  findOrganizerOf(
    id: string,
  ): Promise<{
    title: string;
    organizerUserId: string | null;
    organizerOrg: { ownerUserId: string } | null;
  } | null> {
    return this.prisma.event.findUnique({
      where: { id },
      select: {
        title: true,
        organizerUserId: true,
        organizerOrg: { select: { ownerUserId: true } },
      },
    });
  }

  findCard(id: string): Promise<EventWithCard | null> {
    return this.prisma.event.findUnique({ where: { id }, include: cardInclude });
  }

  /** Страница ленты: по дате начала, при равной — по id, чтобы страницы не перекрывались. */
  async feed(
    filter: FeedFilter,
    page: { offset: number; limit: number },
  ): Promise<{ events: EventWithCard[]; total: number }> {
    const where = feedWhere(filter);
    const [events, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        include: cardInclude,
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        skip: page.offset,
        take: page.limit,
      }),
      this.prisma.event.count({ where }),
    ]);
    return { events, total };
  }

  /** Подтверждённые участники по мероприятиям; мероприятий без участников в ответе нет. */
  async confirmedCounts(eventIds: string[]): Promise<Map<string, number>> {
    const rows = await this.prisma.participation.groupBy({
      by: ['eventId'],
      where: { eventId: { in: eventIds }, status: 'confirmed' },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.eventId, row._count._all]));
  }

  confirmedCount(eventId: string): Promise<number> {
    return this.prisma.participation.count({ where: { eventId, status: 'confirmed' } });
  }

  /**
   * Запись пользователя на мероприятие: неотменённая (такая у пары одна), а если её нет —
   * последняя отменённая. `createdAt` — время Clock: после перемотки демо-часов назад
   * отменённая запись может оказаться «новее» активной, поэтому активная ищется первой.
   */
  async viewerParticipation(eventId: string, userId: string): Promise<ParticipationStatus | null> {
    const active = await this.prisma.participation.findFirst({
      where: { eventId, userId, status: { not: 'cancelled' } },
      select: { status: true },
    });
    if (active) return active.status;
    const cancelled = await this.prisma.participation.findFirst({
      where: { eventId, userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { status: true },
    });
    return cancelled?.status ?? null;
  }
}
