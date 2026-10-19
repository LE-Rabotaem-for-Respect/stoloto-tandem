import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ClockModule } from './core/clock';
import { loadStandConfig } from './core/config';
import type { StandConfig } from './core/config';
import { PrismaModule } from './core/prisma/prisma.module';
import { DemoModule, DemoService } from './modules/demo';

@Module({ imports: [PrismaModule, ClockModule, DemoModule] })
class SeedModule {}

export type SeedResult = 'seeded' | 'not_empty' | 'not_demo';

/**
 * Заполняет пустую базу демо-стенда минимальным сидом — той же функцией,
 * что «Сбросить демо-данные». Базу с данными и стенд без демо-режима не
 * трогает, поэтому её можно запускать при каждом старте контейнера.
 */
export async function runSeed(config: StandConfig = loadStandConfig()): Promise<SeedResult> {
  if (!config.demoMode) return 'not_demo';
  const context = await NestFactory.createApplicationContext(SeedModule, { logger: ['error'] });
  try {
    return (await context.get(DemoService).seedIfEmpty()) ? 'seeded' : 'not_empty';
  } finally {
    await context.close();
  }
}

const messages: Record<SeedResult, string> = {
  seeded: 'Демо-данные загружены',
  not_empty: 'В базе уже есть данные — сид пропущен',
  not_demo: 'DEMO_MODE выключен — демо-данные не загружаются',
};

if (require.main === module) {
  runSeed().then(
    (result) => console.log(messages[result]),
    (error: unknown) => {
      console.error(error);
      process.exit(1);
    },
  );
}
