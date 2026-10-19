import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClockStateSource } from '../src/core/clock';
import type { PrismaService } from '../src/core/prisma/prisma.service';
import { prisma } from './db';

afterAll(async () => {
  await prisma.appState.update({
    where: { id: true },
    data: { clockOffsetSeconds: 0, lastResetAt: null },
  });
  await prisma.$disconnect();
});

describe('демо-часы: сдвиг хранится в базе стенда', () => {
  const source = new PrismaClockStateSource(prisma as unknown as PrismaService);

  it('после миграций сдвиг нулевой, сброса не было', async () => {
    expect(await source.read()).toEqual({ offsetSeconds: 0, lastResetAt: null });
  });

  it('читает записанный сдвиг и время сброса', async () => {
    const lastResetAt = new Date('2026-10-19T04:00:00Z');
    await prisma.appState.update({
      where: { id: true },
      data: { clockOffsetSeconds: 86_400, lastResetAt },
    });
    expect(await source.read()).toEqual({ offsetSeconds: 86_400, lastResetAt });
  });
});
