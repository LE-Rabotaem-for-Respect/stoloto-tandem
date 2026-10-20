import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { MessagesModule } from '../messages/messages.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ParticipationsModule } from '../participations/participations.module';
import { NotificationsController } from './notifications.controller';
import { NotificationHandlers } from './notifications.handlers';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';

/**
 * Уведомления внутри платформы (ТЗ 3.3): обработчики доменных событий и центр уведомлений.
 * Данные мероприятий, записей, сообщений и организаций — через сервисы их модулей.
 */
@Module({
  imports: [EventsModule, ParticipationsModule, MessagesModule, OrganizationsModule],
  controllers: [NotificationsController],
  providers: [NotificationsRepository, NotificationsService, NotificationHandlers],
})
export class NotificationsModule {}
