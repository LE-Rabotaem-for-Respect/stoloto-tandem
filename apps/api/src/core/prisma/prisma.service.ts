import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

// Без таймаута пул pg ждёт недоступную базу до таймаута ОС, и запросы зависают.
// Сессия всегда в UTC: адаптер передаёт и читает timestamptz без смещения, поэтому при поясе
// сервера не UTC время, записанное в SQL (в том числе now()), читалось бы со сдвигом.
// Параметр options в DATABASE_URL заменил бы этот, поэтому в адресе базы его не задают
function adapter(connectionString: string) {
  return new PrismaPg({
    connectionString,
    connectionTimeoutMillis: 5_000,
    options: '-c TimeZone=UTC',
  });
}

export function createPrismaClient(connectionString: string) {
  return new PrismaClient({ adapter: adapter(connectionString) });
}

/** Клиент базы для репозиториев модулей. Подключается при первом запросе. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('Не задана переменная окружения DATABASE_URL');
    super({ adapter: adapter(url) });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
