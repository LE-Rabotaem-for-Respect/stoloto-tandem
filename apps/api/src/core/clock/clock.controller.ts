import { Controller, Get, Inject } from '@nestjs/common';
import { STAND_CONFIG } from '../config';
import type { StandConfig } from '../config';
import { Clock } from './clock';

/** Web берёт «сейчас» и режим стенда отсюда, а не из часов браузера и сборки. */
@Controller('clock')
export class ClockController {
  constructor(
    private readonly clock: Clock,
    @Inject(STAND_CONFIG) private readonly config: StandConfig,
  ) {}

  @Get()
  get() {
    return {
      now: this.clock.now().toISOString(),
      demoMode: this.config.demoMode,
      standId: this.config.standId,
      lastResetAt: this.clock.lastResetAt?.toISOString() ?? null,
    };
  }
}
