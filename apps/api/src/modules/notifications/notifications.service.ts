import { Injectable } from '@nestjs/common';
import { NOTIFICATION_ICON, isNotificationType, notificationText } from '@tandem/domain';
import type { NotificationPayload, NotificationType } from '@tandem/domain';
import { Clock } from '../../core/clock';
import { NotificationsRepository } from './notifications.repository';

/** Уведомление в центре уведомлений: пиктограмма типа и одна строка (ТЗ 2.11). */
export interface NotificationView {
  id: string;
  type: NotificationType;
  icon: string;
  text: string;
  link: string | null;
  createdAt: string;
  read: boolean;
}

export interface NotificationList {
  items: NotificationView[];
  unread: number;
}

const PAGE = 50;

/** Центр уведомлений: свои уведомления пользователя и отметка «прочитано». */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly repository: NotificationsRepository,
    private readonly clock: Clock,
  ) {}

  async list(userId: string): Promise<NotificationList> {
    const [rows, unread] = await Promise.all([
      this.repository.list(userId, PAGE),
      this.repository.unreadCount(userId),
    ]);
    const items = rows.flatMap((row): NotificationView[] => {
      // Тип вне списка (старые записи) не показываем, а не роняем весь список
      if (!isNotificationType(row.type)) return [];
      const payload = row.payload as NotificationPayload;
      return [
        {
          id: row.id,
          type: row.type,
          icon: NOTIFICATION_ICON[row.type],
          text: notificationText(row.type, payload),
          link: row.link,
          createdAt: row.createdAt.toISOString(),
          read: row.readAt !== null,
        },
      ];
    });
    return { items, unread };
  }

  async markRead(userId: string, ids?: readonly string[]): Promise<{ unread: number }> {
    await this.repository.markRead(userId, ids, this.clock.now());
    return { unread: await this.repository.unreadCount(userId) };
  }
}
