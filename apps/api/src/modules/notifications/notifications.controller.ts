import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { NOTIFICATION_ICON, isNotificationType, notificationText } from '@tandem/domain';
import type { NotificationPayload, NotificationType } from '@tandem/domain';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsUUID } from 'class-validator';
import { Clock } from '../../core/clock';
import type { Actor } from '../../core/policies';
import { CurrentActor, SignedIn } from '../auth';
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

export class MarkReadDto {
  /** Без списка — прочитаны все. */
  @IsOptional()
  @IsArray({ message: 'Передайте список уведомлений' })
  @ArrayMaxSize(100, { message: 'Не больше 100 уведомлений за раз' })
  @IsUUID('all', { each: true, message: 'Неверный номер уведомления' })
  @Type(() => String)
  ids?: string[];
}

const PAGE = 50;

// У любого вошедшего есть userId; гостя сюда не пускает guard
const userIdOf = (actor: Actor) => (actor.role === 'guest' ? '' : actor.userId);

@Controller('notifications')
@SignedIn()
export class NotificationsController {
  constructor(
    private readonly repository: NotificationsRepository,
    private readonly clock: Clock,
  ) {}

  @Get()
  async list(@CurrentActor() actor: Actor): Promise<NotificationList> {
    const userId = userIdOf(actor);
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

  @Post('read')
  @HttpCode(200)
  async read(@CurrentActor() actor: Actor, @Body() dto: MarkReadDto): Promise<{ unread: number }> {
    const userId = userIdOf(actor);
    await this.repository.markRead(userId, dto.ids, this.clock.now());
    return { unread: await this.repository.unreadCount(userId) };
  }
}
