import type {
  ErrorCode,
  EventStatus,
  OrganizationStatus,
  ParticipationStatus,
} from '@tandem/domain';

/** Кто выполняет действие. Роль берётся из сессии, не из запроса. */
export type Actor =
  | { role: 'guest' }
  | { role: 'user'; userId: string }
  | { role: 'org'; userId: string; organization: { id: string; status: OrganizationStatus } }
  | { role: 'admin'; userId: string };

/** То, что политикам нужно знать о мероприятии. */
export interface PolicyEvent {
  status: EventStatus;
  startsAt: Date;
  endsAt: Date;
  organizerUserId: string | null;
  organizerOrgId: string | null;
}

/** Запись текущего пользователя на мероприятие; `null` — записи нет. */
export type ViewerParticipation = ParticipationStatus | null;

export type Decision = { allowed: true } | { allowed: false; code: ErrorCode; requiresAuth?: true };

const allow: Decision = { allowed: true };
const deny = (code: ErrorCode): Decision => ({ allowed: false, code });
const loginFirst: Decision = { allowed: false, code: 'unauthorized', requiresAuth: true };

export function isEventOrganizer(actor: Actor, event: PolicyEvent): boolean {
  if (actor.role === 'user') return event.organizerUserId === actor.userId;
  if (actor.role === 'org') return event.organizerOrgId === actor.organization.id;
  return false;
}

const signedUp: readonly ParticipationStatus[] = ['pending', 'confirmed', 'waitlist'];

/**
 * Опубликованное и отменённое видят все; снятое и удалённое — организатор,
 * записавшиеся (ТЗ 2.10: им виден баннер о снятии) и администратор.
 */
export function canViewEvent(
  actor: Actor,
  event: PolicyEvent,
  participation: ViewerParticipation,
): Decision {
  if (event.status === 'published' || event.status === 'cancelled') return allow;
  if (actor.role === 'admin' || isEventOrganizer(actor, event)) return allow;
  if (participation && signedUp.includes(participation)) return allow;
  return deny('event_not_available');
}

/** Записаться, подать заявку, встать в лист ожидания. Статус записи проверяет автомат. */
export function canJoin(actor: Actor, event: PolicyEvent, now: Date): Decision {
  if (actor.role === 'guest') return loginFirst;
  if (actor.role !== 'user') return deny('users_only');
  if (isEventOrganizer(actor, event)) return deny('own_event');
  if (event.status !== 'published' || now >= event.endsAt) return deny('event_not_joinable');
  return allow;
}

/**
 * Отменить свою запись или заявку. У снятого, удалённого, отменённого и завершённого
 * мероприятия записи не меняются (ТЗ 4.3, 2.10). Статус записи проверяет автомат.
 */
export function canLeave(actor: Actor, event: PolicyEvent, now: Date): Decision {
  if (actor.role === 'guest') return loginFirst;
  if (actor.role !== 'user') return deny('users_only');
  if (event.status !== 'published' || now >= event.endsAt) return deny('event_not_joinable');
  return allow;
}

export function canSeeParticipantInfo(
  actor: Actor,
  event: PolicyEvent,
  participation: ViewerParticipation,
): Decision {
  if (actor.role === 'guest') return loginFirst;
  if (actor.role === 'admin' || isEventOrganizer(actor, event)) return allow;
  if (actor.role === 'user' && participation === 'confirmed') return allow;
  return deny('participants_only');
}

export function canCreateEvent(actor: Actor): Decision {
  if (actor.role === 'guest') return loginFirst;
  if (actor.role === 'user') return allow;
  if (actor.role === 'org') {
    return actor.organization.status === 'approved' ? allow : deny('organization_not_approved');
  }
  return deny('forbidden');
}

/** Принять или отклонить заявку, перенести, отменить — только автор, администратор не может. */
export function canManageEvent(actor: Actor, event: PolicyEvent): Decision {
  if (actor.role === 'guest') return loginFirst;
  return isEventOrganizer(actor, event) ? allow : deny('not_event_organizer');
}

/** Писать в обсуждение. Со снятым и удалённым мероприятием новые действия заблокированы (ТЗ 2.10). */
export function canPostMessage(actor: Actor, event: PolicyEvent): Decision {
  if (event.status === 'unpublished' || event.status === 'deleted') {
    return deny('event_not_available');
  }
  if (actor.role === 'guest') return loginFirst;
  if (actor.role === 'user') return allow;
  if (actor.role === 'org') {
    return actor.organization.status === 'approved' ? allow : deny('organization_not_approved');
  }
  return deny('forbidden');
}

/** Редактировать профиль организации и отправить его на проверку — в любом статусе. */
export function canEditOrganization(actor: Actor, organizationId: string): Decision {
  if (actor.role === 'guest') return loginFirst;
  return actor.role === 'org' && actor.organization.id === organizationId
    ? allow
    : deny('not_organization_owner');
}

/** Модерация сообщений и мероприятий, заявки организаций и каталог направлений. */
export function canModerate(actor: Actor): Decision {
  if (actor.role === 'guest') return loginFirst;
  return actor.role === 'admin' ? allow : deny('admins_only');
}
