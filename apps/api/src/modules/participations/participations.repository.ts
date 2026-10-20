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

const rowSelect = {
  id: true,
  eventId: true,
  userId: true,
  status: true,
} satisfies Prisma.ParticipationSelect;

export type ParticipationRow = Prisma.ParticipationGetPayload<{ select: typeof rowSelect }>;

export interface ParticipantRow extends ParticipationRow {
  answer: string | null;
  decisionReason: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  user: { id: string; name: string };
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

  /** Мероприятие без блокировки — для просмотра списка. */
  findEvent(id: string): Promise<JoinableEvent | null> {
    return this.prisma.event.findUnique({ where: { id }, select: eventSelect });
  }

  /** К какому мероприятию относится запись — чтобы заблокировать его до чтения статуса. */
  async eventIdOf(id: string): Promise<string | null> {
    const row = await this.prisma.participation.findUnique({
      where: { id },
      select: { eventId: true },
    });
    return row?.eventId ?? null;
  }

  async signedUpUserIds(eventId: string): Promise<string[]> {
    const rows = await this.prisma.participation.findMany({
      where: { eventId, status: { in: ['pending', 'confirmed', 'waitlist'] } },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

  findById(id: string, tx: Db): Promise<ParticipationRow | null> {
    return tx.participation.findUnique({ where: { id }, select: rowSelect });
  }

  /** Все записи мероприятия по времени подачи: из него же — позиция в листе ожидания. */
  listByEvent(eventId: string): Promise<ParticipantRow[]> {
    return this.prisma.participation.findMany({
      where: { eventId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        ...rowSelect,
        answer: true,
        decisionReason: true,
        decidedAt: true,
        createdAt: true,
        user: { select: { id: true, name: true } },
      },
    });
  }

  /** Решение организатора: статус меняется, только если он ещё `from`. */
  async decide(
    id: string,
    from: ParticipationStatus,
    to: ParticipationStatus,
    decision: { by: string; reason: string | null; at: Date },
    tx: Db,
  ): Promise<boolean> {
    const { count } = await tx.participation.updateMany({
      where: { id, status: from },
      data: {
        status: to,
        decidedById: decision.by,
        decisionReason: decision.reason,
        decidedAt: decision.at,
        updatedAt: decision.at,
      },
    });
    return count === 1;
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
