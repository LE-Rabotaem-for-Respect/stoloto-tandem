import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { MessagesModule } from '../messages/messages.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

/** Админка: обзор, допуск организаций, поиск организаций и мероприятий (ТЗ 2.10). */
@Module({
  imports: [OrganizationsModule, EventsModule, MessagesModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
