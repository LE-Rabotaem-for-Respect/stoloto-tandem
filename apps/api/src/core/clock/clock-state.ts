import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Состояние демо-часов стенда — строка `app_state`. */
export interface ClockState {
  offsetSeconds: number;
  lastResetAt: Date | null;
}

/** Откуда Clock берёт сдвиг; в тестах подменяется. */
export abstract class ClockStateSource {
  abstract read(): Promise<ClockState>;
}

@Injectable()
export class PrismaClockStateSource extends ClockStateSource {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async read(): Promise<ClockState> {
    // Строку вставляет миграция; её отсутствие не должно ронять старт
    const row = await this.prisma.appState.findUnique({ where: { id: true } });
    return { offsetSeconds: row?.clockOffsetSeconds ?? 0, lastResetAt: row?.lastResetAt ?? null };
  }
}
