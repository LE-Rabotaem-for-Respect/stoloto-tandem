import { Injectable } from '@nestjs/common';
import { participationMachine } from '@tandem/domain';
import type { Action, ParticipationStatus } from '@tandem/domain';
import { isUUID } from 'class-validator';
import { Clock } from '../../core/clock';
import { ApiError } from '../../core/errors';
import type { ErrorFields } from '../../core/errors';
import { EventBus, domainEvent } from '../../core/event-bus';
import {
  canDecideParticipation,
  canJoin,
  canLeave,
  canViewParticipants,
  participationActions,
} from '../../core/policies';
import type { Actor } from '../../core/policies';
import { ParticipationsRepository } from './participations.repository';
import type { Db, JoinableEvent, ParticipantRow } from './participations.repository';

export interface ParticipationView {
  id: string;
  eventId: string;
  status: ParticipationStatus;
}

/** Запись в «Участниках и заявках»: почты участника здесь нет — организатору она не нужна. */
export interface ParticipantView {
  id: string;
  status: ParticipationStatus;
  user: { id: string; name: string };
  answer: string | null;
  decisionReason: string | null;
  createdAt: Date;
  decidedAt: Date | null;
  actions: Action[];
}

export interface ParticipantsView {
  eventId: string;
  capacity: number | null;
  confirmedCount: number;
  pending: ParticipantView[];
  confirmed: ParticipantView[];
  waitlist: ParticipantView[];
  archive: ParticipantView[];
}

// Ответ нужен, только если организатор задал вопрос, и только к нему
function answerErrors(event: JoinableEvent, answer: string | undefined): ErrorFields {
  const question = event.mode === 'approval' ? event.applyQuestion : null;
  if (question && !answer) return { answer: 'Ответьте на вопрос организатора' };
  if (!question && answer) return { answer: 'У мероприятия нет вопроса к заявке' };
  return {};
}

/**
 * Запись на мероприятие (ТЗ 2.4, 2.5, 4.3). Любое изменение занятости идёт здесь, в
 * транзакции с блокировкой строки события (DECISION-002): места считаются под блокировкой,
 * и последнее место не займут двое.
 */
@Injectable()
export class ParticipationsService {
  constructor(
    private readonly participations: ParticipationsRepository,
    private readonly clock: Clock,
    private readonly bus: EventBus,
  ) {}

  /**
   * Свободная запись — сразу участник, по заявке — «Заявка на рассмотрении» с ответом на
   * вопрос организатора. Без мест свободная запись не проходит: лист ожидания — P1 (ТЗ 3.2).
   */
  join(actor: Actor, eventId: string, answer?: string): Promise<ParticipationView> {
    return this.bus.afterCommit((emit) =>
      this.participations.transaction(async (tx) => {
        const event = await this.lock(eventId, tx);
        const now = this.clock.now();
        // Видимость не проверяется: на снятое мероприятие ответ — «недоступно для записи»
        const decision = canJoin(actor, event, now);
        if (!decision.allowed) throw new ApiError(decision.code);
        if (actor.role !== 'user') throw new ApiError('users_only');

        const fields = answerErrors(event, answer);
        if (Object.keys(fields).length > 0) throw new ApiError('validation_failed', fields);

        const active = await this.participations.findActive(event.id, actor.userId, tx);
        const confirmed = await this.participations.confirmedCount(event.id, tx);
        const hasSeats = event.capacity === null || confirmed < event.capacity;
        const status = participationMachine.nextState(active?.status ?? null, 'join', {
          mode: event.mode,
          hasSeats,
        });
        if (status === 'waitlist') throw new ApiError('no_seats');

        const participation = await this.participations.create(
          {
            eventId: event.id,
            userId: actor.userId,
            status,
            answer: event.mode === 'approval' && event.applyQuestion ? (answer ?? null) : null,
            at: now,
          },
          tx,
        );
        const ids = { participationId: participation.id, eventId: event.id, userId: actor.userId };
        const meta = { actorId: actor.userId, occurredAt: now };
        emit(
          status === 'pending'
            ? domainEvent('ParticipationRequested', { ...ids, ...meta })
            : domainEvent('ParticipationConfirmed', { ...ids, via: 'join', ...meta }),
        );
        return { id: participation.id, eventId: event.id, status };
      }),
    );
  }

  /** Отмена своей записи или заявки: после неё записаться снова можно (ТЗ 2.4). */
  leave(actor: Actor, eventId: string): Promise<ParticipationView> {
    return this.bus.afterCommit((emit) =>
      this.participations.transaction(async (tx) => {
        const event = await this.lock(eventId, tx);
        const now = this.clock.now();
        const decision = canLeave(actor, event, now);
        if (!decision.allowed) throw new ApiError(decision.code);
        if (actor.role !== 'user') throw new ApiError('users_only');

        const active = await this.participations.findActive(event.id, actor.userId, tx);
        const status = participationMachine.nextState(active?.status ?? null, 'cancel', {
          mode: event.mode,
          hasSeats: true,
        });
        // Под блокировкой события запись не меняется параллельно: active здесь есть
        if (
          !active ||
          !(await this.participations.changeStatus(active.id, active.status, status, now, tx))
        ) {
          throw new ApiError('conflict');
        }
        emit(
          domainEvent('ParticipationCancelled', {
            participationId: active.id,
            eventId: event.id,
            userId: actor.userId,
            previousStatus: active.status,
            actorId: actor.userId,
            occurredAt: now,
          }),
        );
        return { id: active.id, eventId: event.id, status };
      }),
    );
  }

  /** Все, кто записан или подал заявку: им важны перенос, отмена и снятие (уведомления, ТЗ 3.3). */
  signedUpUserIds(eventId: string): Promise<string[]> {
    return this.participations.signedUpUserIds(eventId);
  }

  /**
   * «Участники и заявки» (ТЗ 2.5): ждут решения, участники, лист ожидания и архив
   * (отклонённые и отменённые). Организатору — с действиями у заявок, администратору —
   * только просмотр.
   */
  async participants(actor: Actor, eventId: string): Promise<ParticipantsView> {
    const event = isUUID(eventId) ? await this.participations.findEvent(eventId) : null;
    if (!event) throw new ApiError('event_not_available');
    const decision = canViewParticipants(actor, event);
    if (!decision.allowed) throw new ApiError(decision.code);

    const rows = await this.participations.listByEvent(event.id);
    const confirmedCount = rows.filter((row) => row.status === 'confirmed').length;
    const card = {
      ...event,
      hasSeats: event.capacity === null || confirmedCount < event.capacity,
    };
    const now = this.clock.now();
    const view = (row: ParticipantRow): ParticipantView => ({
      id: row.id,
      status: row.status,
      user: row.user,
      answer: row.answer,
      decisionReason: row.decisionReason,
      createdAt: row.createdAt,
      decidedAt: row.decidedAt,
      actions: participationActions(actor, card, row.status, now),
    });
    const group = (...statuses: ParticipationStatus[]) =>
      rows.filter((row) => statuses.includes(row.status)).map(view);
    return {
      eventId: event.id,
      capacity: event.capacity,
      confirmedCount,
      pending: group('pending'),
      confirmed: group('confirmed'),
      waitlist: group('waitlist'),
      archive: group('rejected', 'cancelled'),
    };
  }

  /** Принять заявку: под блокировкой события, места считает автомат (ТЗ 2.4). */
  accept(actor: Actor, participationId: string): Promise<ParticipationView> {
    return this.decide(actor, participationId, 'accept', null);
  }

  /** Отклонить заявку, причина необязательна; после отказа повторной заявки нет. */
  reject(actor: Actor, participationId: string, reason?: string): Promise<ParticipationView> {
    return this.decide(actor, participationId, 'reject', reason || null);
  }

  private async decide(
    actor: Actor,
    participationId: string,
    action: 'accept' | 'reject',
    reason: string | null,
  ): Promise<ParticipationView> {
    const eventId = isUUID(participationId)
      ? await this.participations.eventIdOf(participationId)
      : null;
    if (!eventId) throw new ApiError('not_found');
    return this.bus.afterCommit((emit) =>
      this.participations.transaction(async (tx) => {
        const event = await this.lock(eventId, tx);
        const now = this.clock.now();
        const decision = canDecideParticipation(actor, event, now);
        if (!decision.allowed) throw new ApiError(decision.code);
        // canDecideParticipation пускает только организатора, а он вошёл
        if (actor.role === 'guest') throw new ApiError('unauthorized');

        // Статус читается под блокировкой: параллельное решение уже применено или ждёт
        const participation = await this.participations.findById(participationId, tx);
        if (!participation) throw new ApiError('not_found');
        const confirmed = await this.participations.confirmedCount(event.id, tx);
        const status = participationMachine.nextState(participation.status, action, {
          mode: event.mode,
          hasSeats: event.capacity === null || confirmed < event.capacity,
        });
        const changed = await this.participations.decide(
          participation.id,
          participation.status,
          status,
          { by: actor.userId, reason, at: now },
          tx,
        );
        if (!changed) throw new ApiError('conflict');

        const ids = {
          participationId: participation.id,
          eventId: event.id,
          userId: participation.userId,
        };
        const meta = { actorId: actor.userId, occurredAt: now };
        emit(
          action === 'accept'
            ? domainEvent('ParticipationConfirmed', { ...ids, via: 'accept', ...meta })
            : domainEvent('ParticipationRejected', { ...ids, reason, ...meta }),
        );
        return { id: participation.id, eventId: event.id, status };
      }),
    );
  }

  // Несуществующее мероприятие и неверный id — одинаково «Мероприятие недоступно»
  private async lock(eventId: string, tx: Db): Promise<JoinableEvent> {
    const event = isUUID(eventId) ? await this.participations.lockEvent(eventId, tx) : null;
    if (!event) throw new ApiError('event_not_available');
    return event;
  }
}
