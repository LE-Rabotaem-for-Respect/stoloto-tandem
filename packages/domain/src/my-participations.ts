import type { EventDisplayStatus } from './display-status';
import type { ParticipationStatus } from './state-machines';

/** Группы раздела «Мои записи» (ТЗ 2.5) — в порядке показа. */
export const PARTICIPATION_GROUPS = ['upcoming', 'pending', 'past'] as const;
export type ParticipationGroup = (typeof PARTICIPATION_GROUPS)[number];

export const PARTICIPATION_GROUP_TITLES: Record<ParticipationGroup, string> = {
  upcoming: 'Предстоящие',
  pending: 'Ждут решения',
  past: 'Прошедшие',
};

// Мероприятия, на которые уже не прийти
const OVER: readonly EventDisplayStatus[] = ['finished', 'cancelled', 'unpublished', 'deleted'];

/**
 * Группа записи в «Моих записях» (ТЗ 2.5). «Прошедшие» — завершённые мероприятия,
 * отменённые организатором и снятые модератором. «Ждут решения» — заявки на рассмотрении.
 * Остальное — «Предстоящие», в том числе идущее; итог записи (участник, отказ, отмена)
 * виден по статусу.
 */
export function participationGroup(
  status: ParticipationStatus,
  event: EventDisplayStatus,
): ParticipationGroup {
  if (OVER.includes(event)) return 'past';
  return status === 'pending' ? 'pending' : 'upcoming';
}
