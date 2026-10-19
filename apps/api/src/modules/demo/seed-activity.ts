import { DEMO_EMAIL_DOMAIN, normalizeSportName } from '@tandem/domain';
import type { Prisma } from '../../generated/prisma/client';
import { dayAt, nearestWeekdayAt } from './relative-dates';
import { SEED_BACKGROUND_PEOPLE, SEED_CUSTOM_SPORT, SEED_EVENTS } from './seed-data';
import type { SeedEvent, SeedWhen } from './seed-data';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export interface SeedIds {
  /** Ключ демо-аккаунта → id пользователя; дополняется фоновыми участниками. */
  userIds: Map<string, string>;
  /** Ключ аккаунта организации → id организации. */
  orgIds: Map<string, string>;
  sportId: (name: string) => string;
}

function at(now: Date, when: SeedWhen, time: string): Date {
  return 'days' in when ? dayAt(now, when.days, time) : nearestWeekdayAt(now, when.weekdays, time);
}

const minDate = (a: Date, b: Date) => (a.getTime() < b.getTime() ? a : b);

/**
 * Жизнь стенда (ТЗ 4.6, docs/scenarios.md): фоновые участники, мероприятия,
 * записи, заявки и обсуждения. Даты считаются от `now` по календарю
 * Красноярска; все отметки «когда сделано» — не позже `now`.
 */
export async function seedActivity(
  tx: Prisma.TransactionClient,
  now: Date,
  passwordHash: string,
  { userIds, orgIds, sportId }: SeedIds,
) {
  const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);
  const userId = (key: string) => {
    const id = userIds.get(key);
    if (!id) throw new Error(`В сиде нет человека «${key}»`);
    return id;
  };

  for (const person of SEED_BACKGROUND_PEOPLE) {
    const user = await tx.user.create({
      data: {
        name: person.name,
        email: `${person.key}@${DEMO_EMAIL_DOMAIN}`,
        passwordHash,
        city: 'Красноярск',
        createdAt: daysAgo(person.registeredDaysAgo),
      },
    });
    userIds.set(person.key, user.id);
  }

  const custom = await tx.sport.create({
    data: {
      name: SEED_CUSTOM_SPORT.name,
      normalizedName: normalizeSportName(SEED_CUSTOM_SPORT.name),
      category: SEED_CUSTOM_SPORT.category,
      isCustom: true,
      createdById: userId(SEED_CUSTOM_SPORT.createdBy),
    },
  });
  const sportOf = (name: string) => (name === SEED_CUSTOM_SPORT.name ? custom.id : sportId(name));

  for (const item of SEED_EVENTS) {
    await seedEvent(tx, now, item, { userId, orgIds, sportOf, adminId: userId('admin') });
  }
}

interface EventIds {
  userId: (key: string) => string;
  orgIds: Map<string, string>;
  sportOf: (name: string) => string;
  adminId: string;
}

async function seedEvent(
  tx: Prisma.TransactionClient,
  now: Date,
  item: SeedEvent,
  { userId, orgIds, sportOf, adminId }: EventIds,
) {
  const startsAt = at(now, item.when, item.when.from);
  const endsAt = at(now, item.when, item.when.to);
  // Опубликовано за неделю до начала, но не позже, чем сейчас
  const createdAt = new Date(minDate(startsAt, now).getTime() - 7 * DAY_MS);
  const step = (hours: number) => new Date(createdAt.getTime() + hours * HOUR_MS);

  const byOrg = 'org' in item.organizer;
  const orgId = 'org' in item.organizer ? orgIds.get(item.organizer.org) : undefined;
  // Решения по заявкам и ответы в обсуждении организации даёт её представитель
  const organizerKey = 'org' in item.organizer ? item.organizer.org : item.organizer.user;
  const organizerUserId = userId(organizerKey);
  const unpublishedAt = new Date(now.getTime() - DAY_MS);

  const event = await tx.event.create({
    data: {
      organizerUserId: byOrg ? undefined : organizerUserId,
      organizerOrgId: orgId,
      sportId: sportOf(item.sport),
      title: item.title,
      description: item.description,
      startsAt,
      endsAt,
      city: 'Красноярск',
      area: item.area,
      placeText: item.placeText,
      participantInfo: item.participantInfo ?? '',
      mode: item.mode,
      applyQuestion: item.applyQuestion,
      capacity: item.capacity,
      level: item.level,
      firstTimersOk: item.firstTimersOk ?? false,
      price: item.price,
      howItGoes: item.howItGoes ?? '',
      status: item.unpublishedReason ? 'unpublished' : 'published',
      statusReason: item.unpublishedReason,
      statusChangedAt: item.unpublishedReason ? unpublishedAt : createdAt,
      createdAt,
    },
  });

  for (const [index, person] of item.participants.entries()) {
    const joinedAt = step(2 + index);
    const decided = item.mode === 'approval';
    await tx.participation.create({
      data: {
        eventId: event.id,
        userId: userId(person),
        status: 'confirmed',
        decidedById: decided ? organizerUserId : undefined,
        decidedAt: decided ? step(24 + index) : undefined,
        createdAt: joinedAt,
        updatedAt: decided ? step(24 + index) : joinedAt,
      },
    });
  }
  for (const [index, request] of item.requests.entries()) {
    const requestedAt = step(48 + index);
    await tx.participation.create({
      data: {
        eventId: event.id,
        userId: userId(request.person),
        status: 'pending',
        answer: request.answer,
        createdAt: requestedAt,
        updatedAt: requestedAt,
      },
    });
  }

  for (const [index, message] of item.messages.entries()) {
    const question = await tx.message.create({
      data: {
        eventId: event.id,
        authorUserId: userId(message.author),
        text: message.text,
        createdAt: step(72 + index * 2),
      },
    });
    await tx.message.create({
      data: {
        eventId: event.id,
        authorUserId: organizerUserId,
        asOrganizationId: orgId,
        parentId: question.id,
        text: message.reply,
        createdAt: step(73 + index * 2),
      },
    });
  }

  if (item.unpublishedReason) {
    await tx.moderationLog.create({
      data: {
        actorUserId: adminId,
        action: 'unpublish',
        objectType: 'event',
        objectId: event.id,
        reason: item.unpublishedReason,
        createdAt: unpublishedAt,
      },
    });
  }
}
