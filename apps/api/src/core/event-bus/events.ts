import type { OrganizationStatus } from '@tandem/domain';

/**
 * Полный перечень доменных событий (DECISION-002). Добавить событие —
 * значит дописать его сюда. Обработчики — только побочные эффекты:
 * уведомления, Хелфигочи, журнал; переходы автоматов и места меняет сервис.
 */
export interface DomainEventPayloads {
  EventCreated: { eventId: string };
  /** В том числе условия участия и «Информация для участников». */
  EventUpdated: { eventId: string; fields: readonly string[] };
  EventRescheduled: { eventId: string; previousStartsAt: Date; startsAt: Date; endsAt: Date };
  EventCancelled: { eventId: string; reason: string };
  EventUnpublished: { eventId: string; reason: string };
  EventRestored: { eventId: string };
  EventDeleted: { eventId: string; reason: string };
  /** Заявка на мероприятие по заявке. */
  ParticipationRequested: { participationId: string; eventId: string; userId: string };
  /**
   * `join` — человек записался сам (свободная запись), `accept` — организатор
   * принял заявку. Продвижение из листа ожидания — отдельное событие.
   */
  ParticipationConfirmed: {
    participationId: string;
    eventId: string;
    userId: string;
    via: 'join' | 'accept';
  };
  ParticipationWaitlisted: { participationId: string; eventId: string; userId: string };
  /** `reason` — причина отказа, если организатор её указал: её показывает уведомление. */
  ParticipationRejected: {
    participationId: string;
    eventId: string;
    userId: string;
    reason: string | null;
  };
  ParticipationCancelled: { participationId: string; eventId: string; userId: string };
  ParticipationPromotedFromWaitlist: { participationId: string; eventId: string; userId: string };
  MessagePosted: { messageId: string; eventId: string; authorId: string };
  MessageHidden: { messageId: string; eventId: string; reason: string };
  MessageDeleted: {
    messageId: string;
    eventId: string;
    by: 'author' | 'moderator';
    reason?: string;
  };
  OrganizationSubmitted: { organizationId: string };
  OrganizationDecided: {
    organizationId: string;
    decision: Extract<OrganizationStatus, 'approved' | 'rejected' | 'needs_changes'>;
    reason?: string;
  };
}

export type DomainEventType = keyof DomainEventPayloads;

/** Общее у всех событий: кто сделал (`null` — система) и когда — по Clock. */
export interface DomainEventMeta {
  actorId: string | null;
  occurredAt: Date;
}

export type DomainEvent<T extends DomainEventType = DomainEventType> = {
  [K in T]: { type: K } & DomainEventMeta & DomainEventPayloads[K];
}[T];

// Объект, а не массив: компилятор проверит, что перечислены все события и ни одного лишнего
const typeSet: Record<DomainEventType, true> = {
  EventCreated: true,
  EventUpdated: true,
  EventRescheduled: true,
  EventCancelled: true,
  EventUnpublished: true,
  EventRestored: true,
  EventDeleted: true,
  ParticipationRequested: true,
  ParticipationConfirmed: true,
  ParticipationWaitlisted: true,
  ParticipationRejected: true,
  ParticipationCancelled: true,
  ParticipationPromotedFromWaitlist: true,
  MessagePosted: true,
  MessageHidden: true,
  MessageDeleted: true,
  OrganizationSubmitted: true,
  OrganizationDecided: true,
};

export const DOMAIN_EVENT_TYPES = Object.keys(typeSet) as readonly DomainEventType[];

export function domainEvent<T extends DomainEventType>(
  type: T,
  fields: DomainEventPayloads[T] & DomainEventMeta,
): DomainEvent<T> {
  return { type, ...fields } as DomainEvent<T>;
}
