import { Inject, Injectable } from '@nestjs/common';
import type { CanActivate } from '@nestjs/common';
import { STAND_CONFIG } from '../../core/config';
import type { StandConfig } from '../../core/config';
import { ApiError } from '../../core/errors';

/** Вне `DEMO_MODE=true` демо-маршрутов как будто нет: 404 (DECISION-002). */
@Injectable()
export class DemoModeGuard implements CanActivate {
  constructor(@Inject(STAND_CONFIG) private readonly config: StandConfig) {}

  canActivate(): boolean {
    if (!this.config.demoMode) throw new ApiError('not_found');
    return true;
  }
}
