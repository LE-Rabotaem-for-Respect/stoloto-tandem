import type { ErrorCode } from './errors';

/** Закрытый список действий, которые API отдаёт в `actions[]` (ТЗ 4.4). */
export const ACTION_CODES = [
  'join',
  'leave',
  'create_event',
  'edit_event',
  'accept_participation',
  'reject_participation',
  'reschedule_event',
  'cancel_event',
  'view_participant_info',
  // Вкладка «Участники и заявки» (ТЗ 2.5): организатору и администратору
  'view_participants',
  'post_message',
  'edit_message',
  'edit_organization',
  'submit_organization',
  'hide_message',
  'delete_message',
  'unpublish_event',
  'delete_event',
  'restore_event',
  'review_organization',
  'manage_catalog',
] as const;
export type ActionCode = (typeof ACTION_CODES)[number];

/**
 * Действие над объектом для текущего пользователя. Неактивное — с причиной
 * (`enabled: false`, `reason`); гостю — `requiresAuth: true`, после входа он
 * возвращается к действию (ТЗ 2.4, 2.6).
 */
export interface Action {
  code: ActionCode;
  enabled: boolean;
  reason?: string;
  /** Код причины: по нему экран берёт короткую форму для панели действия (`shortErrorMessage`). */
  reasonCode?: ErrorCode;
  requiresAuth?: boolean;
}
