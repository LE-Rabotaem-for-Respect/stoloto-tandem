import { Injectable } from '@nestjs/common';
import { Clock } from '../../core/clock';
import { PrismaService } from '../../core/prisma/prisma.service';
import { hashPassword } from '../auth/password';
import { clearDemoData, seedDemo } from './seed';

/** Пароль всех демо-аккаунтов (ТЗ 4.6). */
const DEMO_PASSWORD = 'demo';

/** Сброс демо-данных и перемотка демо-часов (ТЗ 4.6). Только при `DEMO_MODE=true`. */
@Injectable()
export class DemoService {
  // argon2id намеренно медленный: хеш пароля demo считается один раз на процесс
  private passwordHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

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
    await this.prisma.appState.update({
      where: { id: true },
      data: { clockOffsetSeconds: { increment: addSeconds } },
    });
    await this.clock.refresh();
    return this.clock.now();
  }
}
