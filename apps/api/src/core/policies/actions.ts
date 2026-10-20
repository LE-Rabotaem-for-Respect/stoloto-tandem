import { errorMessage, eventMachine, participationMachine } from '@tandem/domain';
import type {
  Action,
  ActionCode,
  ErrorCode,
  EventAction,
  EventMode,
  ParticipationStatus,
} from '@tandem/domain';
import {
  canDecideParticipation,
  canJoin,
  canLeave,
  canManageEvent,
  canModerate,
  canPostMessage,
} from './policies';
import type { Actor, Decision, PolicyEvent, ViewerParticipation } from './policies';

/** Решение политики → элемент `actions[]`: неактивное — с причиной, гостю — `requiresAuth`. */
export function toAction(code: ActionCode, decision: Decision): Action {
  if (decision.allowed) return { code, enabled: true };
  const action: Action = { code, enabled: false };
  if (decision.requiresAuth) action.requiresAuth = true;
  action.reason = errorMessage(decision.code);
  action.reasonCode = decision.code;
  return action;
}

// Отказ автомата: его текст точнее общего текста кода
const disabled = (code: ActionCode, error: { code: ErrorCode; message: string }): Action => ({
  code,
  enabled: false,
  reason: error.message,
  reasonCode: error.code,
});

export interface CardEvent extends PolicyEvent {
  mode: EventMode;
  hasSeats: boolean;
}

// Доступность кнопки до ввода: причину и новое время человек укажет в форме
function eventAction(code: ActionCode, action: EventAction, event: CardEvent, now: Date): Action {
  const result = eventMachine.check(event.status, action, {
    now,
    startsAt: event.startsAt,
    newStartsAt: new Date(now.getTime() + 86_400_000),
    reason: 'указана в форме',
  });
  return result.ok ? { code, enabled: true } : disabled(code, result.error);
}

/**
 * Пример `actions[]` для карточки события: права — из тех же политик, что
 * проверяет сервис, статусы — из автоматов domain. Управление видит только
 * организатор, модерацию — только администратор.
 */
export function eventActions(
  actor: Actor,
  event: CardEvent,
  participation: ViewerParticipation,
  now: Date,
): Action[] {
  const actions: Action[] = [];
  // Записавшемуся главная кнопка — «Отменить запись», а не неактивная «Записаться» (ТЗ 2.2)
  const cancel = participationMachine.check(participation, 'cancel', event);
  const join = canJoin(actor, event, now);
  if (cancel.ok) {
    actions.push(toAction('leave', canLeave(actor, event, now)));
  } else if (join.allowed) {
    const check = participationMachine.check(participation, 'join', event);
    actions.push(check.ok ? toAction('join', join) : disabled('join', check.error));
  } else {
    actions.push(toAction('join', join));
  }
  actions.push(toAction('post_message', canPostMessage(actor, event)));
  if (canManageEvent(actor, event).allowed) {
    actions.push(eventAction('edit_event', 'edit', event, now));
    actions.push(eventAction('reschedule_event', 'reschedule', event, now));
    actions.push(eventAction('cancel_event', 'cancel', event, now));
  }
  if (canModerate(actor).allowed) {
    if (event.status === 'unpublished') {
      actions.push(eventAction('restore_event', 'restore', event, now));
    } else {
      actions.push(eventAction('unpublish_event', 'unpublish', event, now));
    }
    actions.push(eventAction('delete_event', 'delete', event, now));
  }
  return actions;
}

/**
 * `actions[]` у записи в «Участниках и заявках» (ТЗ 2.4, 2.5): принять и отклонить —
 * только организатору и только у заявки. Администратор смотрит список без действий.
 */
export function participationActions(
  actor: Actor,
  event: CardEvent,
  status: ParticipationStatus,
  now: Date,
): Action[] {
  if (status !== 'pending' || !canManageEvent(actor, event).allowed) return [];
  const decide = canDecideParticipation(actor, event, now);
  if (!decide.allowed) {
    return [toAction('accept_participation', decide), toAction('reject_participation', decide)];
  }
  const accept = participationMachine.check(status, 'accept', event);
  return [
    accept.ok
      ? { code: 'accept_participation', enabled: true }
      : disabled('accept_participation', accept.error),
    { code: 'reject_participation', enabled: true },
  ];
}
