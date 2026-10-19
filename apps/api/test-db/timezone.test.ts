import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../src/core/prisma/prisma.service';
import { createSport, createUser, databaseUrl, eventData, prisma } from './db';

// Пояс сервера не UTC — как у PostgreSQL, установленного на машине разработчика в Красноярске
const serverTimeZone = 'Asia/Krasnoyarsk';

async function databaseName() {
  const [row] = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  if (!row) throw new Error('Не удалось узнать имя тестовой базы');
  return row.name;
}

let client: ReturnType<typeof createPrismaClient>;

beforeAll(async () => {
  await prisma.$executeRawUnsafe(
    `ALTER DATABASE "${await databaseName()}" SET timezone TO '${serverTimeZone}'`,
  );
  // Настройка базы действует на соединения, открытые после неё, поэтому клиент — новый
  client = createPrismaClient(databaseUrl);
});

afterAll(async () => {
  await prisma.$executeRawUnsafe(`ALTER DATABASE "${await databaseName()}" RESET timezone`);
  await client.$disconnect();
  await prisma.$disconnect();
});

async function createEvent(startsAt: Date) {
  const [organizer, sport] = await Promise.all([createUser(), createSport()]);
  return client.event.create({
    data: {
      ...eventData(sport.id),
      startsAt,
      endsAt: new Date(startsAt.getTime() + 90 * 60_000),
      organizerUserId: organizer.id,
    },
  });
}

describe(`время в базе при поясе сервера ${serverTimeZone}`, () => {
  it('время, записанное SQL, Prisma читает без сдвига', async () => {
    const event = await createEvent(new Date('2026-10-21T12:00:00Z'));
    await client.$executeRaw`
      UPDATE "events" SET "ends_at" = '2026-10-21 13:45:00+00' WHERE "id" = ${event.id}::uuid`;

    const read = await client.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(read.endsAt.toISOString()).toBe('2026-10-21T13:45:00.000Z');
  });

  it('now() в SQL Prisma читает как текущее время', async () => {
    const event = await createEvent(new Date('2026-10-21T12:00:00Z'));
    await client.$executeRaw`
      UPDATE "events" SET "status_changed_at" = now() WHERE "id" = ${event.id}::uuid`;

    const read = await client.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(Math.abs(read.statusChangedAt.getTime() - Date.now())).toBeLessThan(60_000);
  });

  it('время, записанное Prisma, SQL читает без сдвига', async () => {
    const event = await createEvent(new Date('2026-10-21T12:00:00Z'));

    const rows = await client.$queryRaw<{ same: boolean }[]>`
      SELECT "starts_at" = '2026-10-21 12:00:00+00'::timestamptz AS same
      FROM "events" WHERE "id" = ${event.id}::uuid`;
    expect(rows).toEqual([{ same: true }]);
  });

  it('время параметром в SQL совпадает со временем, записанным Prisma', async () => {
    const startsAt = new Date('2026-10-21T12:00:00Z');
    const event = await createEvent(startsAt);

    const rows = await client.$queryRaw<{ same: boolean }[]>`
      SELECT "starts_at" = ${startsAt} AS same FROM "events" WHERE "id" = ${event.id}::uuid`;
    expect(rows).toEqual([{ same: true }]);
  });
});
