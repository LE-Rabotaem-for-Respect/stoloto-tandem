import { Injectable } from '@nestjs/common';
import type { NotificationPayload, NotificationType } from '@tandem/domain';
import { PrismaService } from '../../core/prisma/prisma.service';

export interface NewNotification {
  userId: string;
  type: NotificationType;
  payload: NotificationPayload;
  link: string;
  createdAt: Date;
}

/** Мероприятие глазами уведомлений: название и кто его организатор. */
export interface EventTarget {
  title: string;
  /** Пользователь-организатор или представитель организации-организатора. */
  organizerUserId: string;
}

const SIGNED_UP = ['pending', 'confirmed', 'waitlist'] as const;

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async eventTarget(eventId: string): Promise<EventTarget | null> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        title: true,
        organizerUserId: true,
        organizerOrg: { select: { ownerUserId: true } },
      },
    });
    const organizerUserId = event?.organizerUserId ?? event?.organizerOrg?.ownerUserId;
    return event && organizerUserId ? { title: event.title, organizerUserId } : null;
  }

  /** Все, кто записан или подал заявку: им важны перенос, отмена и снятие. */
  async signedUpUserIds(eventId: string): Promise<string[]> {
    const rows = await this.prisma.participation.findMany({
      where: { eventId, status: { in: [...SIGNED_UP] } },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

  participation(id: string) {
    return this.prisma.participation.findUnique({
      where: { id },
      select: { userId: true, decisionReason: true },
    });
  }

  message(id: string) {
    return this.prisma.message.findUnique({
      where: { id },
      select: {
        authorUserId: true,
        asOrganizationId: true,
        parent: { select: { authorUserId: true } },
      },
    });
  }

  organization(id: string) {
    return this.prisma.organization.findUnique({
      where: { id },
      select: { name: true, ownerUserId: true },
    });
  }

  async create(notifications: NewNotification[]) {
    if (notifications.length === 0) return;
    await this.prisma.notification.createMany({
      data: notifications.map((notification) => ({
        ...notification,
        payload: { ...notification.payload },
      })),
    });
  }

  list(userId: string, take: number) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
    });
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  /** Отмечает прочитанными свои уведомления: перечисленные или все. */
  async markRead(userId: string, ids: readonly string[] | undefined, now: Date) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null, ...(ids && { id: { in: [...ids] } }) },
      data: { readAt: now },
    });
  }
}
