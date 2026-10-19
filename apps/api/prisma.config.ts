import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // generate не подключается к базе, поэтому адрес нужен только миграциям
    url: process.env.DATABASE_URL ?? '',
  },
});
