import { Module } from '@nestjs/common';
import { ClockModule } from './core/clock';
import { PrismaModule } from './core/prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [PrismaModule, ClockModule, HealthModule],
})
export class AppModule {}
