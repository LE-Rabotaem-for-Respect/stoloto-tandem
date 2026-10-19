import { Module } from '@nestjs/common';
import { ClockModule } from './core/clock';
import { EventBusModule } from './core/event-bus';
import { PrismaModule } from './core/prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { SportsModule } from './modules/sports/sports.module';

@Module({
  imports: [PrismaModule, ClockModule, EventBusModule, HealthModule, SportsModule],
})
export class AppModule {}
