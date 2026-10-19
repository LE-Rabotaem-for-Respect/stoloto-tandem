import { randomUUID } from 'node:crypto';
import { inject } from 'vitest';
import type { ParticipationStatus } from '../src/generated/prisma/client';
import { createPrismaClient } from '../src/core/prisma/prisma.service';

export const databaseUrl = inject('databaseUrl');
export const prisma = createPrismaClient(databaseUrl);

const at = new Date('2026-10-19T12:00:00Z');

export async function createUser() {
  return prisma.user.create({
    data: {
      name: 'Анна',
      email: `user-${randomUUID()}@test.local`,
      passwordHash: 'hash',
      createdAt: at,
    },
  });
}

export async function createSport() {
  const name = `спорт ${randomUUID()}`;
  return prisma.sport.create({ data: { name, normalizedName: name } });
}

export async function createOrganization() {
  const owner = await createUser();
  return prisma.organization.create({
    data: {
      ownerUserId: owner.id,
      name: 'Клуб',
      description: 'Описание',
      city: 'Красноярск',
      contacts: '+7 900 000-00-00',
      representativeName: 'Иван Петров',
      representativeRole: 'Тренер',
    },
  });
}

export function eventData(sportId: string) {
  return {
    sportId,
    title: 'Футбол в среду',
    description: 'Играем 7 на 7',
    startsAt: new Date('2026-10-21T12:00:00Z'),
    endsAt: new Date('2026-10-21T13:30:00Z'),
    city: 'Красноярск',
    area: 'Центральный',
    placeText: 'Стадион',
    statusChangedAt: at,
    createdAt: at,
  };
}

export async function createEvent() {
  const [organizer, sport] = await Promise.all([createUser(), createSport()]);
  return prisma.event.create({ data: { ...eventData(sport.id), organizerUserId: organizer.id } });
}

export function participation(eventId: string, userId: string, status: ParticipationStatus) {
  return prisma.participation.create({
    data: { eventId, userId, status, createdAt: at, updatedAt: at },
  });
}
