import { Module } from '@nestjs/common';
import { NotificationHandlers } from './notifications.handlers';
import { NotificationsController } from './notifications.controller';
import { NotificationsRepository } from './notifications.repository';

/** Уведомления внутри платформы (ТЗ 3.3): обработчики доменных событий и центр уведомлений. */
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsRepository, NotificationHandlers],
})
export class NotificationsModule {}
