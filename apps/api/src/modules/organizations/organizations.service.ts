import { Injectable } from '@nestjs/common';
import { organizationMachine } from '@tandem/domain';
import type { OrganizationStatus } from '@tandem/domain';
import { Clock } from '../../core/clock';
import { ApiError } from '../../core/errors';
import { EventBus, domainEvent } from '../../core/event-bus';
import { canEditOrganization, canModerate, organizationActions } from '../../core/policies';
import type { Actor, Decision } from '../../core/policies';
import type { UpdateOrganizationDto } from './dto';
import { toOwnView, toPublicView } from './organization-view';
import type { OwnOrganizationView, PublicOrganizationView } from './organization-view';
import { SportsService } from '../sports/sports.service';
import { OrganizationsRepository } from './organizations.repository';
import type { OrganizationRecord } from './organizations.repository';

export type OrganizationDecision = 'approve' | 'reject' | 'request_changes';

const NOT_FOUND = 'Организация не найдена';

function allowOrThrow(decision: Decision) {
  if (!decision.allowed) throw new ApiError(decision.code);
}

type RequiredProfile = Pick<
  OrganizationRecord,
  'name' | 'description' | 'city' | 'contacts' | 'representativeName' | 'representativeRole'
> & { sports: readonly unknown[] };

/** Что ещё не заполнено для отправки на проверку (ТЗ 2.9, п. 1). */
function missingForSubmit(organization: RequiredProfile): Record<string, string> {
  const fields: Record<string, string> = {};
  const required = [
    ['name', 'Укажите название'],
    ['description', 'Расскажите, чем занимается организация'],
    ['city', 'Укажите город'],
    ['contacts', 'Укажите контакты'],
    ['representativeName', 'Укажите, кто представитель'],
    ['representativeRole', 'Укажите роль представителя'],
  ] as const;
  for (const [field, message] of required) {
    if (!organization[field].trim()) fields[field] = message;
  }
  if (organization.sports.length === 0) fields.sportIds = 'Выберите хотя бы одно направление';
  return fields;
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly repository: OrganizationsRepository,
    private readonly clock: Clock,
    private readonly eventBus: EventBus,
    private readonly sports: SportsService,
  ) {}

  /**
   * Своя организация и администратору — заявка со статусом в любом статусе;
   * остальным — публичная страница только у одобренной, иначе 404 (ТЗ 2.9, п. 3).
   */
  async view(actor: Actor, id: string): Promise<OwnOrganizationView | PublicOrganizationView> {
    const organization = await this.repository.find(id);
    if (!organization) throw new ApiError('not_found', undefined, NOT_FOUND);
    if (canEditOrganization(actor, id).allowed || actor.role === 'admin') {
      return toOwnView(organization, organizationActions(actor, organization));
    }
    if (organization.status !== 'approved') throw new ApiError('not_found', undefined, NOT_FOUND);
    return toPublicView(organization);
  }

  /** Правка профиля — в любом статусе, у одобренной применяется сразу (ТЗ 2.9, пп. 3, 7). */
  async update(actor: Actor, id: string, dto: UpdateOrganizationDto): Promise<OwnOrganizationView> {
    allowOrThrow(canEditOrganization(actor, id));
    const { sportIds, website, ...profile } = dto;
    const uniqueSports = sportIds && [...new Set(sportIds)];
    if (uniqueSports && !(await this.sports.allActive(uniqueSports))) {
      throw new ApiError('validation_failed', { sportIds: 'Такого направления нет в каталоге' });
    }
    const changes = website === undefined ? profile : { ...profile, website: website || null };

    // После отправки на проверку обязательное поле очистить нельзя: иначе одобренная
    // организация (её правки применяются сразу) осталась бы без города, контактов, направлений
    const organization = await this.repository.find(id);
    if (!organization) throw new ApiError('not_found', undefined, NOT_FOUND);
    if (organization.status !== 'draft') {
      const missing = missingForSubmit({
        ...organization,
        // В DTO не заданные в запросе поля могут быть undefined — они не меняют профиль
        ...Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)),
        sports: uniqueSports ?? organization.sports,
      });
      if (Object.keys(missing).length > 0) throw new ApiError('validation_failed', missing);
    }
    const updated = await this.repository.updateProfile(id, changes, uniqueSports);
    return toOwnView(updated, organizationActions(actor, updated));
  }

  /** «Отправить на проверку»: черновик, отклонённую или возвращённую на правки. */
  async submit(actor: Actor, id: string): Promise<OwnOrganizationView> {
    allowOrThrow(canEditOrganization(actor, id));
    const organization = await this.repository.find(id);
    if (!organization) throw new ApiError('not_found', undefined, NOT_FOUND);
    const to = organizationMachine.nextState(organization.status, 'submit', {});
    const missing = missingForSubmit(organization);
    if (Object.keys(missing).length > 0) throw new ApiError('validation_failed', missing);

    await this.eventBus.afterCommit(async (emit) => {
      const changed = await this.repository.changeStatus(id, organization.status, {
        status: to,
        submittedAt: this.clock.now(),
        decisionReason: null,
        decidedById: null,
        decidedAt: null,
      });
      if (!changed) throw new ApiError('conflict', undefined, 'Статус заявки уже изменился');
      emit(
        domainEvent('OrganizationSubmitted', {
          organizationId: id,
          actorId: actor.role === 'guest' ? null : actor.userId,
          occurredAt: this.clock.now(),
        }),
      );
    });
    return this.ownView(actor, id);
  }

  /**
   * Решение администратора по заявке на проверке. Публикует `OrganizationDecided`
   * (уведомление представителю, журнал). Маршрут — в админке.
   */
  async decide(
    actor: Actor,
    id: string,
    decision: OrganizationDecision,
    reason?: string,
  ): Promise<OwnOrganizationView> {
    allowOrThrow(canModerate(actor));
    if (actor.role !== 'admin') throw new ApiError('admins_only');
    const organization = await this.repository.find(id);
    if (!organization) throw new ApiError('not_found', undefined, NOT_FOUND);
    const to = organizationMachine.nextState(organization.status, decision, { reason });
    if (to !== 'approved' && to !== 'rejected' && to !== 'needs_changes') {
      throw new Error(`Решение по организации привело к статусу ${to}`);
    }
    const now = this.clock.now();

    await this.eventBus.afterCommit(async (emit) => {
      const changed = await this.repository.changeStatus(id, organization.status, {
        status: to,
        decisionReason: reason?.trim() || null,
        decidedById: actor.userId,
        decidedAt: now,
      });
      if (!changed) throw new ApiError('conflict', undefined, 'Статус заявки уже изменился');
      emit(
        domainEvent('OrganizationDecided', {
          organizationId: id,
          decision: to,
          reason: reason?.trim() || undefined,
          actorId: actor.userId,
          occurredAt: now,
        }),
      );
    });
    return this.ownView(actor, id);
  }

  /** Организации для администратора (ТЗ 2.10): заявка целиком — статус, причина, представитель. */
  async adminList(
    actor: Actor,
    filter: { text?: string; status?: OrganizationStatus; id?: string },
    page: { limit: number; offset: number },
  ): Promise<{ items: OwnOrganizationView[]; total: number; limit: number; offset: number }> {
    allowOrThrow(canModerate(actor));
    const { organizations, total } = await this.repository.adminSearch(filter, page);
    return { items: organizations.map(toOwnView), total, ...page };
  }

  /** Заявки, которые ждут решения администратора (обзор админки). */
  countPending(): Promise<number> {
    return this.repository.countByStatus('pending');
  }

  /** Название и владелец — кому сообщить о решении администратора (уведомления, ТЗ 3.3). */
  async owner(id: string): Promise<{ name: string; ownerUserId: string } | null> {
    const organization = await this.repository.find(id);
    return organization && { name: organization.name, ownerUserId: organization.ownerUserId };
  }

  private async ownView(actor: Actor, id: string): Promise<OwnOrganizationView> {
    const organization = await this.repository.find(id);
    if (!organization) throw new ApiError('not_found', undefined, NOT_FOUND);
    return toOwnView(organization, organizationActions(actor, organization));
  }
}
