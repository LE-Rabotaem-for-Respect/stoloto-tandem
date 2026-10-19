import { Injectable } from '@nestjs/common';
import type { ParticipationStatus } from '@tandem/domain';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

export type Db = Prisma.TransactionClient;

// Строку события модуль участия читает сам, в обход сервиса мероприятий: DECISION-002
// требует блокировать её и считать места в одной транзакции сервиса участия
const eventSelect = {
  id: true,
  organizerUserId: true,
  organizerOrgId: true,
  status: true,
  startsAt: true,
  endsAt: true,
  mode: true,
  applyQuestion: true,
  capacity: true,
} satisfies Prisma.EventSelect;

export type JoinableEvent = Prisma.EventGetPayload<{ select: typeof eventSelect }>;

export interface ActiveParticipation {
  id: string;
  status: ParticipationStatus;
}

@Injectable()
export class ParticipationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(work);
  }

  /**
   * Блокирует строку события до конца транзакции (DECISION-002, «Лимит мест»): записи
   * на одно мероприятие идут по очереди, и последнее место не займут двое.
   */
  async lockEvent(id: string, tx: Db): Promise<JoinableEvent | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "events" WHERE "id" = ${id}::uuid FOR UPDATE`;
    if (locked.length === 0) return null;
    return tx.event.findUnique({ where: { id }, select: eventSelect });
  }

  /** Неотменённая запись пользователя: у пары она одна (частичный уникальный индекс). */
  findActive(eventId: string, userId: string, tx: Db): Promise<ActiveParticipation | null> {
    return tx.participation.findFirst({
      where: { eventId, userId, status: { not: 'cancelled' } },
      select: { id: true, status: true },
    });
  }

  confirmedCount(eventId: string, tx: Db): Promise<number> {
    return tx.participation.count({ where: { eventId, status: 'confirmed' } });
  }

  create(
    data: {
      eventId: string;
      userId: string;
      status: ParticipationStatus;
      answer: string | null;
      at: Date;
    },
    tx: Db,
  ): Promise<ActiveParticipation> {
    const { at, ...fields } = data;
    return tx.participation.create({
      data: { ...fields, createdAt: at, updatedAt: at },
      select: { id: true, status: true },
    });
  }

  /** Меняет статус, только если он ещё `from`; `false` — запись уже изменили. */
  async changeStatus(
    id: string,
    from: ParticipationStatus,
    to: ParticipationStatus,
    at: Date,
    tx: Db,
  ): Promise<boolean> {
    const { count } = await tx.participation.updateMany({
      where: { id, status: from },
      data: { status: to, updatedAt: at },
    });
    return count === 1;
  }
}
