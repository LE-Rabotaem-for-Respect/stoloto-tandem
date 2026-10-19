import { Module } from '@nestjs/common';
import { ClockModule } from './core/clock';
import { EventBusModule } from './core/event-bus';
import { PrismaModule } from './core/prisma/prisma.module';
import { AuthModule } from './modules/auth';
import { HealthModule } from './modules/health/health.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SportsModule } from './modules/sports/sports.module';

@Module({
  imports: [
    PrismaModule,
    ClockModule,
    EventBusModule,
    AuthModule,
    NotificationsModule,
    HealthModule,
    SportsModule,
  ],
})
export class AppModule {}
