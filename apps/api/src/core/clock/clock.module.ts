import { Global, Module } from '@nestjs/common';
import { STAND_CONFIG, loadStandConfig } from '../config';
import { Clock, REAL_TIME } from './clock';
import type { RealTime } from './clock';
import { ClockStateSource, PrismaClockStateSource } from './clock-state';
import { ClockController } from './clock.controller';

const realTime: RealTime = () => Date.now();

@Global()
@Module({
  controllers: [ClockController],
  providers: [
    { provide: STAND_CONFIG, useFactory: () => loadStandConfig() },
    { provide: REAL_TIME, useValue: realTime },
    { provide: ClockStateSource, useClass: PrismaClockStateSource },
    Clock,
  ],
  exports: [Clock, STAND_CONFIG],
})
export class ClockModule {}
