import { Injectable } from '@nestjs/common';
import { ApiError } from '../../core/errors';
import { canModerate } from '../../core/policies';
import type { Actor } from '../../core/policies';
import { EventsService } from '../events/events.service';
import { MessagesService } from '../messages/messages.service';
import type { OwnOrganizationView } from '../organizations/organization-view';
import { OrganizationsService } from '../organizations/organizations.service';
import type { AdminOrganizationDecision } from './admin.dto';

/** Плитки обзора админки (ТЗ 2.10): с каждой — переход к своему списку. */
export interface AdminOverview {
  pendingOrganizations: number;
  unpublishedEventsLastWeek: number;
  hiddenMessages: number;
}

/**
 * Админка собирает данные модулей через их сервисы (DECISION-002): своих таблиц
 * у неё нет. Права проверяются здесь и ещё раз в сервисах модулей.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly events: EventsService,
    private readonly messages: MessagesService,
  ) {}

  async overview(actor: Actor): Promise<AdminOverview> {
    const decision = canModerate(actor);
    if (!decision.allowed) throw new ApiError(decision.code);
    const [pendingOrganizations, unpublishedEventsLastWeek, hiddenMessages] = await Promise.all([
      this.organizations.countPending(),
      this.events.countUnpublishedLastWeek(),
      this.messages.countHidden(),
    ]);
    return { pendingOrganizations, unpublishedEventsLastWeek, hiddenMessages };
  }

  /** «Одобрить» или «Отклонить» с причиной: организация сразу видит решение и причину. */
  decide(
    actor: Actor,
    id: string,
    decision: AdminOrganizationDecision,
    reason?: string,
  ): Promise<OwnOrganizationView> {
    return this.organizations.decide(actor, id, decision, reason);
  }
}
