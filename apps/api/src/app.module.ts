import { Module } from '@nestjs/common';
import { ClockModule } from './core/clock';
import { EventBusModule } from './core/event-bus';
import { PrismaModule } from './core/prisma/prisma.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth';
import { DemoModule } from './modules/demo';
import { EventsModule } from './modules/events/events.module';
import { HealthModule } from './modules/health/health.module';
import { MessagesModule } from './modules/messages/messages.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { ParticipationsModule } from './modules/participations/participations.module';
import { SportsModule } from './modules/sports/sports.module';

@Module({
  imports: [
    PrismaModule,
    ClockModule,
    EventBusModule,
    AuthModule,
    DemoModule,
    OrganizationsModule,
    HealthModule,
    SportsModule,
    EventsModule,
    MessagesModule,
    ParticipationsModule,
    AdminModule,
    NotificationsModule,
  ],
})
export class AppModule {}
