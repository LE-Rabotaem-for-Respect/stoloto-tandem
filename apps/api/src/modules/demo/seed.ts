import { demoAccountEmail, normalizeSportName } from '@tandem/domain';
import type { Prisma } from '../../generated/prisma/client';
import { SEED_ACCOUNTS, SEED_SPORTS } from './seed-data';

const DAY_MS = 86_400_000;

/**
 * Таблицы, которые очищает сброс: все данные стенда, кроме `app_state`
 * (настройки стенда) и журнала миграций. Тест сверяет список со схемой.
 */
export const RESET_TABLES = [
  'users',
  'user_sports',
  'organizations',
  'organization_sports',
  'sports',
  'event_series',
  'events',
  'participations',
  'messages',
  'notifications',
  'company_requests',
  'moderation_log',
  'helfigochi',
  'helfigochi_ledger',
  'helfigochi_rules',
  'accessories',
  'user_accessories',
  'sessions',
  'calendar_tokens',
  'series_subscriptions',
] as const;

// Список — константа кода, а не ввод: собирать запрос строкой здесь безопасно
const TRUNCATE_SQL = `TRUNCATE ${RESET_TABLES.map((table) => `"${table}"`).join(', ')} CASCADE`;

export async function clearDemoData(tx: Prisma.TransactionClient) {
  await tx.$executeRawUnsafe(TRUNCATE_SQL);
}

/**
 * Минимальный сид (ТЗ 4.6, 2.3): демо-аккаунты, организации в своих
 * статусах и стартовый каталог направлений. Все даты — от `now` (Clock),
 * поэтому в любой день стенд выглядит одинаково «свежим». Его же вызывает
 * «Сбросить демо-данные».
 */
export async function seedDemo(tx: Prisma.TransactionClient, now: Date, passwordHash: string) {
  const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);

  await tx.sport.createMany({
    data: SEED_SPORTS.map((sport) => ({
      name: sport.name,
      normalizedName: normalizeSportName(sport.name),
      aliases: sport.aliases.map(normalizeSportName),
      category: sport.category,
    })),
  });
  const sportIds = new Map(
    (await tx.sport.findMany({ select: { id: true, name: true } })).map((sport) => [
      sport.name,
      sport.id,
    ]),
  );
  const sportId = (name: string) => {
    const id = sportIds.get(name);
    if (!id) throw new Error(`В каталоге сида нет направления «${name}»`);
    return id;
  };

  const userIds = new Map<string, string>();
  for (const account of SEED_ACCOUNTS) {
    const user = await tx.user.create({
      data: {
        name: account.name,
        email: demoAccountEmail(account.key),
        role: account.role,
        passwordHash,
        city: 'Красноярск',
        bio: account.bio,
        settings: account.settings ?? {},
        createdAt: daysAgo(account.registeredDaysAgo),
        sports: {
          create: (account.interests ?? []).map((interest) => ({
            sportId: sportId(interest.sport),
            level: interest.level,
          })),
        },
      },
    });
    userIds.set(account.key, user.id);
  }

  const adminId = userIds.get('admin');
  for (const account of SEED_ACCOUNTS) {
    const org = account.organization;
    if (!org) continue;
    const decided = org.decidedDaysAgo !== undefined;
    await tx.organization.create({
      data: {
        ownerUserId: userIds.get(account.key) as string,
        name: org.name,
        description: org.description,
        city: 'Красноярск',
        contacts: org.contacts,
        website: org.website,
        representativeName: org.representativeName,
        representativeRole: org.representativeRole,
        status: org.status,
        submittedAt: daysAgo(org.submittedDaysAgo),
        decisionReason: org.decisionReason,
        decidedById: decided ? adminId : undefined,
        decidedAt: decided ? daysAgo(org.decidedDaysAgo as number) : undefined,
        sports: { create: org.sports.map((name) => ({ sportId: sportId(name) })) },
      },
    });
  }
}
