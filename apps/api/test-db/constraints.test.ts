import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  createEvent,
  createOrganization,
  createSport,
  createUser,
  databaseUrl,
  eventData,
  participation,
  prisma,
} from './db';

afterAll(async () => {
  await prisma.$disconnect();
});

const duplicateParticipation = /participations_event_user_not_cancelled_key|Unique constraint/;

describe('запись на мероприятие', () => {
  it.each(['pending', 'confirmed', 'waitlist'] as const)(
    'вторая неотменённая запись на ту же пару отклоняется базой (первая — %s)',
    async (first) => {
      const [event, user] = await Promise.all([createEvent(), createUser()]);
      await participation(event.id, user.id, first);
      await expect(participation(event.id, user.id, 'confirmed')).rejects.toThrow(
        duplicateParticipation,
      );
    },
  );

  it('после отмены можно записаться снова', async () => {
    const [event, user] = await Promise.all([createEvent(), createUser()]);
    await participation(event.id, user.id, 'cancelled');
    await participation(event.id, user.id, 'cancelled');
    await expect(participation(event.id, user.id, 'confirmed')).resolves.toMatchObject({
      status: 'confirmed',
    });
  });

  it('после отказа повторная заявка на это событие отклоняется базой', async () => {
    const [event, user] = await Promise.all([createEvent(), createUser()]);
    await participation(event.id, user.id, 'rejected');
    await expect(participation(event.id, user.id, 'pending')).rejects.toThrow(
      duplicateParticipation,
    );
  });

  it('разные пользователи записываются на одно событие независимо', async () => {
    const [event, anna, petr] = await Promise.all([createEvent(), createUser(), createUser()]);
    await participation(event.id, anna.id, 'confirmed');
    await expect(participation(event.id, petr.id, 'confirmed')).resolves.toBeTruthy();
  });
});

describe('организатор мероприятия и серии', () => {
  it('событие с двумя организаторами отклоняется базой', async () => {
    const [user, org, sport] = await Promise.all([
      createUser(),
      createOrganization(),
      createSport(),
    ]);
    await expect(
      prisma.event.create({
        data: { ...eventData(sport.id), organizerUserId: user.id, organizerOrgId: org.id },
      }),
    ).rejects.toThrow(/events_one_organizer_check/);
  });

  it('событие без организатора отклоняется базой', async () => {
    const sport = await createSport();
    await expect(prisma.event.create({ data: eventData(sport.id) })).rejects.toThrow(
      /events_one_organizer_check/,
    );
  });

  it('событие от имени организации сохраняется', async () => {
    const [org, sport] = await Promise.all([createOrganization(), createSport()]);
    await expect(
      prisma.event.create({ data: { ...eventData(sport.id), organizerOrgId: org.id } }),
    ).resolves.toMatchObject({ organizerUserId: null, organizerOrgId: org.id });
  });

  it('серия с двумя организаторами или без организатора отклоняется базой', async () => {
    const [user, org] = await Promise.all([createUser(), createOrganization()]);
    const series = {
      weekdays: [2, 4],
      until: new Date('2026-12-01T00:00:00Z'),
      createdAt: new Date('2026-10-19T00:00:00Z'),
    };
    await expect(
      prisma.eventSeries.create({
        data: { ...series, organizerUserId: user.id, organizerOrgId: org.id },
      }),
    ).rejects.toThrow(/event_series_one_organizer_check/);
    await expect(prisma.eventSeries.create({ data: series })).rejects.toThrow(
      /event_series_one_organizer_check/,
    );
  });

  it('окончание не позже начала, нулевой лимит и отрицательная цена отклоняются базой', async () => {
    const [user, sport] = await Promise.all([createUser(), createSport()]);
    const base = { ...eventData(sport.id), organizerUserId: user.id };
    await expect(prisma.event.create({ data: { ...base, endsAt: base.startsAt } })).rejects.toThrow(
      /events_ends_after_start_check/,
    );
    await expect(prisma.event.create({ data: { ...base, capacity: 0 } })).rejects.toThrow(
      /events_capacity_positive_check/,
    );
    await expect(prisma.event.create({ data: { ...base, price: -1 } })).rejects.toThrow(
      /events_price_non_negative_check/,
    );
  });
});

describe('пользователь', () => {
  it('ненормализованная почта отклоняется базой', async () => {
    await expect(
      prisma.user.create({
        data: { name: 'Анна', email: ' Anna@Demo ', passwordHash: 'hash', createdAt: new Date(0) },
      }),
    ).rejects.toThrow(/users_email_normalized_check/);
  });
});

describe('аксессуары Хелфигочи', () => {
  it('аксессуар группы выдаётся один раз, значок «другое» — один раз на направление', async () => {
    const [user, sport, other] = await Promise.all([createUser(), createSport(), createSport()]);
    const accessory = await prisma.accessory.create({
      data: { code: `ball-${user.id}`, title: 'Мяч', sportCategory: 'team', icon: 'ball' },
    });
    const unlockedAt = new Date('2026-10-19T00:00:00Z');
    const give = (sportId: string | null) =>
      prisma.userAccessory.create({
        data: { userId: user.id, accessoryId: accessory.id, sportId, unlockedAt },
      });
    await give(null);
    await expect(give(null)).rejects.toThrow(/user_accessories_group_key|Unique constraint/);
    await give(sport.id);
    await expect(give(sport.id)).rejects.toThrow(/user_accessories_sport_key|Unique constraint/);
    await expect(give(other.id)).resolves.toBeTruthy();
  });
});

describe('настройки стенда', () => {
  it('строка настроек создана миграцией и она единственная', async () => {
    await expect(prisma.appState.findMany()).resolves.toEqual([
      { id: true, clockOffsetSeconds: 0, lastResetAt: null, helfigochiEnabled: true },
    ]);
    await expect(prisma.appState.create({ data: { id: false } })).rejects.toThrow(
      /app_state_single_row_check/,
    );
  });
});

describe('миграции', () => {
  it('база после миграций совпадает со schema.prisma', () => {
    // Расхождение значит, что следующий migrate dev сгенерирует лишние изменения
    expect(() =>
      execSync(
        'npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code',
        {
          cwd: resolve(__dirname, '..'),
          env: { ...process.env, DATABASE_URL: databaseUrl },
          stdio: 'pipe',
        },
      ),
    ).not.toThrow();
  });
});
