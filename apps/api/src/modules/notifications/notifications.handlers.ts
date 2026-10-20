import { Injectable } from '@nestjs/common';
import type { NotificationPayload, NotificationType } from '@tandem/domain';
import { Clock } from '../../core/clock';
import { OnDomainEvent } from '../../core/event-bus';
import type { DomainEvent } from '../../core/event-bus';
import { EventsService } from '../events/events.service';
import { MessagesService } from '../messages/messages.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { ParticipationsService } from '../participations/participations.service';
import { NotificationsRepository } from './notifications.repository';

const eventLink = (eventId: string) => `/events/${eventId}`;

/**
 * Уведомления — только из доменных событий (ТЗ 3.3, 4.2), основные модули
 * о них не знают. Кто получает — таблица 3.3; себе уведомление не приходит.
 */
@Injectable()
export class NotificationHandlers {
  constructor(
    private readonly repository: NotificationsRepository,
    private readonly events: EventsService,
    private readonly participations: ParticipationsService,
    private readonly messages: MessagesService,
    private readonly organizations: OrganizationsService,
    private readonly clock: Clock,
  ) {}

  @OnDomainEvent('ParticipationRequested')
  async requested(event: DomainEvent<'ParticipationRequested'>) {
    const target = await this.events.notificationTarget(event.eventId);
    if (!target) return;
    await this.notify([target.organizerUserId], event.actorId, 'participation_requested', {
      payload: { eventTitle: target.title },
      link: eventLink(event.eventId),
    });
  }

  // Свободная запись — действие самого человека, уведомлять его не о чем
  @OnDomainEvent('ParticipationConfirmed')
  async confirmed(event: DomainEvent<'ParticipationConfirmed'>) {
    if (event.via !== 'accept') return;
    await this.toParticipant(event, 'participation_confirmed');
  }

  @OnDomainEvent('ParticipationRejected')
  async rejected(event: DomainEvent<'ParticipationRejected'>) {
    await this.toParticipant(event, 'participation_rejected', {
      reason: event.reason ?? undefined,
    });
  }

  /** Отмена участником (ТЗ 3.3): организатору — только если освободилось место. */
  @OnDomainEvent('ParticipationCancelled')
  async cancelledByParticipant(event: DomainEvent<'ParticipationCancelled'>) {
    if (event.previousStatus !== 'confirmed') return;
    const target = await this.events.notificationTarget(event.eventId);
    if (!target) return;
    await this.notify([target.organizerUserId], event.actorId, 'seat_freed', {
      payload: { eventTitle: target.title },
      link: eventLink(event.eventId),
    });
  }

  @OnDomainEvent('ParticipationPromotedFromWaitlist')
  async promoted(event: DomainEvent<'ParticipationPromotedFromWaitlist'>) {
    await this.toParticipant(event, 'participation_promoted');
  }

  /** Вопрос участника — организатору; ответ организатора — автору вопроса. */
  @OnDomainEvent('MessagePosted')
  async messagePosted(event: DomainEvent<'MessagePosted'>) {
    const [message, target] = await Promise.all([
      this.messages.authorship(event.messageId),
      this.events.notificationTarget(event.eventId),
    ]);
    if (!message || !target) return;
    const byOrganizer = message.fromOrganizer;
    const link = `${eventLink(event.eventId)}#discussion`;
    const payload = { eventTitle: target.title };

    if (!message.parentAuthorUserId && !byOrganizer) {
      await this.notify([target.organizerUserId], event.actorId, 'question_posted', {
        payload,
        link,
      });
    } else if (message.parentAuthorUserId && byOrganizer) {
      await this.notify([message.parentAuthorUserId], event.actorId, 'answer_posted', {
        payload,
        link,
      });
    }
  }

  @OnDomainEvent('EventRescheduled')
  async rescheduled(event: DomainEvent<'EventRescheduled'>) {
    await this.toEveryone(event, 'event_rescheduled', { startsAt: event.startsAt.toISOString() });
  }

  @OnDomainEvent('EventCancelled')
  async cancelled(event: DomainEvent<'EventCancelled'>) {
    await this.toEveryone(event, 'event_cancelled', { reason: event.reason });
  }

  @OnDomainEvent('EventUnpublished')
  async unpublished(event: DomainEvent<'EventUnpublished'>) {
    await this.toEveryone(event, 'event_unpublished', { reason: event.reason });
  }

  @OnDomainEvent('EventDeleted')
  async deleted(event: DomainEvent<'EventDeleted'>) {
    await this.toEveryone(event, 'event_deleted', { reason: event.reason });
  }

  @OnDomainEvent('OrganizationDecided')
  async organizationDecided(event: DomainEvent<'OrganizationDecided'>) {
    const organization = await this.organizations.owner(event.organizationId);
    if (!organization) return;
    await this.notify([organization.ownerUserId], event.actorId, 'organization_decided', {
      payload: {
        organizationName: organization.name,
        decision: event.decision,
        reason: event.reason,
      },
      link: '/profile',
    });
  }

  private async toParticipant(
    event: { eventId: string; userId: string; actorId: string | null },
    type: NotificationType,
    extra: NotificationPayload = {},
  ) {
    const target = await this.events.notificationTarget(event.eventId);
    if (!target) return;
    await this.notify([event.userId], event.actorId, type, {
      payload: { eventTitle: target.title, ...extra },
      link: eventLink(event.eventId),
    });
  }

  /** Перенос, отмена, снятие и удаление: все записавшиеся и организатор. */
  private async toEveryone(
    event: { eventId: string; actorId: string | null },
    type: NotificationType,
    extra: NotificationPayload,
  ) {
    const [target, signedUp] = await Promise.all([
      this.events.notificationTarget(event.eventId),
      this.participations.signedUpUserIds(event.eventId),
    ]);
    if (!target) return;
    await this.notify([...signedUp, target.organizerUserId], event.actorId, type, {
      payload: { eventTitle: target.title, ...extra },
      link: eventLink(event.eventId),
    });
  }

  private async notify(
    userIds: readonly string[],
    actorId: string | null,
    type: NotificationType,
    { payload, link }: { payload: NotificationPayload; link: string },
  ) {
    const recipients = [...new Set(userIds)].filter((id) => id !== actorId);
    const createdAt = this.clock.now();
    await this.repository.create(
      recipients.map((userId) => ({ userId, type, payload, link, createdAt })),
    );
  }
}
