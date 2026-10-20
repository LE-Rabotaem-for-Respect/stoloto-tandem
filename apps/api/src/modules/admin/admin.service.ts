import { Injectable } from '@nestjs/common';
import type { SportCategory } from '@tandem/domain';
import { ApiError } from '../../core/errors';
import { canModerate } from '../../core/policies';
import type { Actor } from '../../core/policies';
import { EventsService } from '../events/events.service';
import { MessagesService } from '../messages/messages.service';
import type { OwnOrganizationView } from '../organizations/organization-view';
import { OrganizationsService } from '../organizations/organizations.service';
import { SportsService } from '../sports/sports.service';
import type { AdminSport } from '../sports/sports.service';
import type { AdminOrganizationDecision, AdminSportsQuery } from './admin.dto';

/** Плитки обзора админки (ТЗ 2.10): с каждой — переход к своему списку. */
export interface AdminOverview {
  pendingOrganizations: number;
  unpublishedEventsLastWeek: number;
  hiddenMessages: number;
}

/** Направление в каталоге админки: сколько мероприятий на нём — видно до объединения и скрытия. */
export interface AdminSportItem extends AdminSport {
  eventCount: number;
}

export interface AdminSportList {
  items: AdminSportItem[];
  total: number;
  limit: number;
  offset: number;
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
    private readonly sports: SportsService,
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

  /** Каталог направлений (ТЗ 2.3): поиск, пользовательские, скрытые. */
  async sportsList(
    actor: Actor,
    query: AdminSportsQuery,
    page: { limit: number; offset: number },
  ): Promise<AdminSportList> {
    allowModeration(actor);
    const { items, total } = await this.sports.adminList(
      { text: query.q || undefined, status: query.status, custom: query.custom },
      page,
    );
    return { items: await this.withEventCounts(items), total, ...page };
  }

  async renameSport(actor: Actor, id: string, name: string): Promise<AdminSportItem> {
    allowModeration(actor);
    return this.withEventCount(await this.sports.rename(id, name));
  }

  async promoteSport(actor: Actor, id: string, category: SportCategory): Promise<AdminSportItem> {
    allowModeration(actor);
    return this.withEventCount(await this.sports.promote(id, category));
  }

  async hideSport(actor: Actor, id: string): Promise<AdminSportItem> {
    allowModeration(actor);
    return this.withEventCount(await this.sports.hide(id));
  }

  /**
   * Объединить дубль с целевым направлением: мероприятия и направления организаций
   * переносят их модули в той же транзакции (ТЗ 2.3, DECISION-003).
   */
  async mergeSport(actor: Actor, id: string, targetId: string): Promise<AdminSportItem> {
    allowModeration(actor);
    const merged = await this.sports.merge(id, targetId, async (tx) => {
      await this.events.moveSport(id, targetId, tx);
      await this.organizations.moveSport(id, targetId, tx);
    });
    return this.withEventCount(merged);
  }

  private async withEventCount(sport: AdminSport): Promise<AdminSportItem> {
    const [item] = await this.withEventCounts([sport]);
    return item ?? { ...sport, eventCount: 0 };
  }

  private async withEventCounts(sports: AdminSport[]): Promise<AdminSportItem[]> {
    const counts = await this.events.countBySports(sports.map((sport) => sport.id));
    return sports.map((sport) => ({ ...sport, eventCount: counts.get(sport.id) ?? 0 }));
  }
}

function allowModeration(actor: Actor) {
  const decision = canModerate(actor);
  if (!decision.allowed) throw new ApiError(decision.code);
}
