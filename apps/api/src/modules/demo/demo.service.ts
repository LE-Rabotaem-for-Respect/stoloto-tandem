import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../../core/clock';
import { STAND_CONFIG } from '../../core/config';
import type { StandConfig } from '../../core/config';
import { ApiError } from '../../core/errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import { hashPassword } from '../auth/password';
import { clearDemoData, seedDemo } from './seed';

/** Предел общего сдвига демо-часов: столбец сдвига в секундах — 32-битное число. */
const MAX_TOTAL_SHIFT_SECONDS = 10 * 365 * 86_400;

/** Пароль всех демо-аккаунтов (ТЗ 4.6). */
const DEMO_PASSWORD = 'demo';

/** Сброс демо-данных и перемотка демо-часов (ТЗ 4.6). Только при `DEMO_MODE=true`. */
@Injectable()
export class DemoService {
  // argon2id намеренно медленный: хеш пароля demo считается один раз на процесс
  private passwordHash?: Promise<string>;
  // Идущий сброс и время окончания последнего — на стенд один процесс api
  private running?: Promise<Date>;
  private finishedAt?: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    @Inject(STAND_CONFIG) private readonly config: StandConfig,
  ) {}

  /**
   * «Сбросить демо-данные» по запросу: пока сброс идёт, повторный запрос ждёт
   * его же и получает тот же результат; новый сброс — не раньше интервала после
   * окончания прошлого (429 с `Retry-After`). Время — реальное, не демо-часы.
   */
  requestReset(): Promise<Date> {
    if (this.running) return this.running;
    const interval = (this.config.demoResetIntervalSeconds ?? 0) * 1000;
    const since =
      this.finishedAt === undefined ? Infinity : this.clock.realNow().getTime() - this.finishedAt;
    // Часы, переведённые назад, не запрещают сброс: отрицательный промежуток — не «только что»
    if (since >= 0 && since < interval) {
      const wait = Math.max(1, Math.ceil((interval - since) / 1000));
      throw new ApiError(
        'too_many_requests',
        undefined,
        `Данные только что сброшены. Повторите через ${wait} с`,
        wait,
      );
    }
    // Интервал отсчитывается от успешного сброса: после сбоя можно повторить сразу
    this.running = this.reset()
      .then((resetAt) => {
        this.finishedAt = this.clock.realNow().getTime();
        return resetAt;
      })
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }

  /** Новый стенд: пустая база заполняется сидом; база с данными не трогается. */
  async seedIfEmpty(): Promise<boolean> {
    if ((await this.prisma.user.count()) > 0) return false;
    await this.reset();
    return true;
  }

  /**
   * «Сбросить демо-данные»: всё стирается и строится заново от текущего
   * времени без сдвига; сдвиг часов обнуляется, время сброса запоминается.
   */
  async reset(): Promise<Date> {
    this.passwordHash ??= hashPassword(DEMO_PASSWORD);
    const passwordHash = await this.passwordHash;
    const now = this.clock.realNow();
    await this.prisma.$transaction(
      async (tx) => {
        await clearDemoData(tx);
        await seedDemo(tx, now, passwordHash);
        await tx.appState.update({
          where: { id: true },
          data: { clockOffsetSeconds: 0, lastResetAt: now },
        });
      },
      { timeout: 30_000 },
    );
    await this.clock.refresh();
    return now;
  }

  /** «Перемотка времени»: сдвиг накапливается и хранится в базе стенда. */
  async shiftClock(addSeconds: number): Promise<Date> {
    // Проверка предела и запись — одним запросом, чтобы два нажатия подряд его не обошли
    const { count } = await this.prisma.appState.updateMany({
      where: { id: true, clockOffsetSeconds: { lte: MAX_TOTAL_SHIFT_SECONDS - addSeconds } },
      data: { clockOffsetSeconds: { increment: addSeconds } },
    });
    if (count === 0) {
      throw new ApiError('validation_failed', {
        addSeconds: 'Часы уже сдвинуты почти на 10 лет — сбросьте демо-данные',
      });
    }
    await this.clock.refresh();
    return this.clock.now();
  }
}
