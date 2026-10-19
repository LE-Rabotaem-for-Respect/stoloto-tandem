import { Injectable } from '@nestjs/common';
import type { MessageStatus, ParticipationStatus } from '@tandem/domain';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

const eventSelect = {
  id: true,
  organizerUserId: true,
  organizerOrgId: true,
  status: true,
  startsAt: true,
  endsAt: true,
} satisfies Prisma.EventSelect;

export type DiscussionEvent = Prisma.EventGetPayload<{ select: typeof eventSelect }>;

// Поля автора перечислены явно: почта и другие поля аккаунта в ответ не уйдут
const messageSelect = {
  id: true,
  eventId: true,
  parentId: true,
  authorUserId: true,
  asOrganizationId: true,
  text: true,
  status: true,
  moderationReason: true,
  createdAt: true,
  editedAt: true,
  author: { select: { id: true, name: true } },
  asOrganization: { select: { id: true, name: true } },
} satisfies Prisma.MessageSelect;

export type MessageRecord = Prisma.MessageGetPayload<{ select: typeof messageSelect }>;

@Injectable()
export class MessagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findEvent(id: string): Promise<DiscussionEvent | null> {
    return this.prisma.event.findUnique({ where: { id }, select: eventSelect });
  }

  /** Неотменённая запись зрителя: по ней снятое мероприятие видят записавшиеся. */
  async viewerParticipation(eventId: string, userId: string): Promise<ParticipationStatus | null> {
    const participation = await this.prisma.participation.findFirst({
      where: { eventId, userId, status: { not: 'cancelled' } },
      select: { status: true },
    });
    return participation?.status ?? null;
  }

  /** Обсуждение целиком, по времени: новые подгружаются раз в 30 секунд (ТЗ 2.7). */
  list(eventId: string): Promise<MessageRecord[]> {
    return this.prisma.message.findMany({
      where: { eventId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: messageSelect,
    });
  }

  find(id: string): Promise<MessageRecord | null> {
    return this.prisma.message.findUnique({ where: { id }, select: messageSelect });
  }

  create(data: {
    eventId: string;
    authorUserId: string;
    asOrganizationId: string | null;
    parentId: string | null;
    text: string;
    createdAt: Date;
  }): Promise<MessageRecord> {
    return this.prisma.message.create({ data, select: messageSelect });
  }

  /** Меняет сообщение, только если его статус ещё `from`; `null` — его уже изменили. */
  async update(
    id: string,
    from: MessageStatus,
    data: { text?: string; editedAt?: Date; status?: MessageStatus },
  ): Promise<MessageRecord | null> {
    const { count } = await this.prisma.message.updateMany({ where: { id, status: from }, data });
    return count === 1 ? this.find(id) : null;
  }
}
