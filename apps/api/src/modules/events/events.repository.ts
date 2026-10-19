import { Injectable } from '@nestjs/common';
import type { ParticipationStatus } from '@tandem/domain';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

type Db = Prisma.TransactionClient;

const cardInclude = {
  sport: { select: { id: true, name: true, category: true, isCustom: true, status: true } },
  organizerUser: { select: { id: true, name: true } },
  organizerOrg: { select: { id: true, name: true } },
} satisfies Prisma.EventInclude;

export type EventWithCard = Prisma.EventGetPayload<{ include: typeof cardInclude }>;

@Injectable()
export class EventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(work);
  }

  create(data: Prisma.EventUncheckedCreateInput, tx: Db): Promise<{ id: string }> {
    return tx.event.create({ data, select: { id: true } });
  }

  findCard(id: string): Promise<EventWithCard | null> {
    return this.prisma.event.findUnique({ where: { id }, include: cardInclude });
  }

  confirmedCount(eventId: string): Promise<number> {
    return this.prisma.participation.count({ where: { eventId, status: 'confirmed' } });
  }

  /** Последняя запись пользователя на мероприятие; `null` — записи не было. */
  async viewerParticipation(eventId: string, userId: string): Promise<ParticipationStatus | null> {
    const participation = await this.prisma.participation.findFirst({
      where: { eventId, userId },
      orderBy: { createdAt: 'desc' },
      select: { status: true },
    });
    return participation?.status ?? null;
  }
}
