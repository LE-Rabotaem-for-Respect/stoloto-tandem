import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { MessagesModule } from '../messages/messages.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { SportsModule } from '../sports/sports.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

/** Админка: обзор, допуск организаций, поиск организаций и мероприятий, каталог направлений (ТЗ 2.3, 2.10). */
@Module({
  imports: [OrganizationsModule, EventsModule, MessagesModule, SportsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
