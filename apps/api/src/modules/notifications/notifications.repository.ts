import { Injectable } from '@nestjs/common';
import { NOTIFICATION_TYPES } from '@tandem/domain';
import type { NotificationPayload, NotificationType } from '@tandem/domain';
import { PrismaService } from '../../core/prisma/prisma.service';

export interface NewNotification {
  userId: string;
  type: NotificationType;
  payload: NotificationPayload;
  link: string;
  createdAt: Date;
}

/** Только таблица уведомлений: данные других модулей — через их сервисы (DECISION-002). */
@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

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
    // Неизвестные типы (старые записи) в список не попадают — и в счётчик тоже
    return this.prisma.notification.count({
      where: { userId, readAt: null, type: { in: [...NOTIFICATION_TYPES] } },
    });
  }

  /** Отмечает прочитанными свои уведомления: перечисленные или все. */
  async markRead(userId: string, ids: readonly string[] | undefined, now: Date) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null, ...(ids && { id: { in: [...ids] } }) },
      data: { readAt: now },
    });
  }
}
