import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

export function createPrismaClient(connectionString: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/** Клиент базы для репозиториев модулей. Подключается при первом запросе. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('Не задана переменная окружения DATABASE_URL');
    super({ adapter: new PrismaPg({ connectionString: url }) });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
