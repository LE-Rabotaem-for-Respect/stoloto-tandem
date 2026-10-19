import { Global, Module, RequestMethod } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { STAND_CONFIG, loadStandConfig } from '../config';
import { Clock, REAL_TIME } from './clock';
import type { RealTime } from './clock';
import { ClockStateSource, PrismaClockStateSource } from './clock-state';
import { ClockController } from './clock.controller';
import { ServerTimeMiddleware } from './server-time.middleware';

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
export class ClockModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ServerTimeMiddleware).forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
