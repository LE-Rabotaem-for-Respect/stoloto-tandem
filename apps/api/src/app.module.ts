import { Module } from '@nestjs/common';
import { ClockModule } from './core/clock';
import { EventBusModule } from './core/event-bus';
import { PrismaModule } from './core/prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [PrismaModule, ClockModule, EventBusModule, HealthModule],
})
export class AppModule {}
