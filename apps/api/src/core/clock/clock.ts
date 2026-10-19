import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { STAND_CONFIG } from '../config';
import type { StandConfig } from '../config';
import { ClockStateSource } from './clock-state';

/** Настоящее время в миллисекундах; в тестах подменяется. */
export const REAL_TIME = Symbol('REAL_TIME');
export type RealTime = () => number;

/**
 * Единственный источник «сейчас» (ТЗ 4.2, DECISION-002). Сдвиг демо-часов
 * хранится в базе стенда и кешируется в памяти процесса, поэтому на стенд —
 * один процесс api. Кеш загружается до приёма запросов; после записи сдвига
 * или сброса демо-данных вызывающий обязан выполнить `refresh()`.
 */
@Injectable()
export class Clock implements OnModuleInit {
  private offsetMs = 0;
  private lastReset: Date | null = null;

  constructor(
    @Inject(STAND_CONFIG) private readonly config: StandConfig,
    private readonly state: ClockStateSource,
    @Inject(REAL_TIME) private readonly realTime: RealTime,
  ) {}

  async onModuleInit() {
    await this.refresh();
  }

  now(): Date {
    return new Date(this.realTime() + this.offsetMs);
  }

  /** Время последнего «Сбросить демо-данные»; вне демо-режима — `null`. */
  get lastResetAt(): Date | null {
    return this.lastReset;
  }

  get demoMode(): boolean {
    return this.config.demoMode;
  }

  async refresh() {
    if (!this.config.demoMode) {
      this.offsetMs = 0;
      this.lastReset = null;
      return;
    }
    const { offsetSeconds, lastResetAt } = await this.state.read();
    this.offsetMs = offsetSeconds * 1000;
    this.lastReset = lastResetAt;
  }
}
