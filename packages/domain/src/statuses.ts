import type { EventDisplayStatus } from './display-status';
import type { MessageStatus, OrganizationStatus, ParticipationStatus } from './state-machines';

/** Тоны статусов из `docs/design.md`; цвет — токены `--status-<тон>-fg` и `--status-<тон>-bg`. */
export const STATUS_TONES = ['ok', 'wait', 'queue', 'bad', 'warn', 'off'] as const;
export type StatusTone = (typeof STATUS_TONES)[number];

/** Статус всегда показывается текстом, пиктограммой и цветом одновременно (ТЗ 2.1, П4). */
export interface StatusView {
  text: string;
  /** Имя пиктограммы из набора `ICONS` web. */
  icon: string;
  tone: StatusTone;
}

export function toneTokens(tone: StatusTone): { fg: string; bg: string } {
  return { fg: `--status-${tone}-fg`, bg: `--status-${tone}-bg` };
}

/** Статусы записи (ТЗ 2.5). Причина отказа показывается отдельной строкой. */
export const PARTICIPATION_STATUS_VIEW: Record<ParticipationStatus, StatusView> = {
  pending: { text: 'Заявка на рассмотрении', icon: 'status-pending', tone: 'wait' },
  confirmed: { text: 'Вы участник', icon: 'status-confirmed', tone: 'ok' },
  waitlist: { text: 'Вы в листе ожидания', icon: 'status-waitlist', tone: 'queue' },
  rejected: { text: 'Заявка отклонена', icon: 'status-rejected', tone: 'bad' },
  cancelled: { text: 'Вы отменили запись', icon: 'status-cancelled', tone: 'off' },
};

/** Текст статуса записи; для листа ожидания — с позицией в очереди (ТЗ 2.5, 3.2). */
export function participationStatusText(status: ParticipationStatus, position?: number): string {
  const { text } = PARTICIPATION_STATUS_VIEW[status];
  return status === 'waitlist' && position !== undefined
    ? `${text}, ваша позиция: ${position}`
    : text;
}

/** Статусы мероприятия (ТЗ 4.3), включая вычисляемые `displayStatus`. */
export const EVENT_STATUS_VIEW: Record<EventDisplayStatus, StatusView> = {
  open: { text: 'Набор открыт', icon: 'action-join', tone: 'ok' },
  full: { text: 'Мест нет — можно встать в лист ожидания', icon: 'status-full', tone: 'queue' },
  rescheduled: { text: 'Перенесено', icon: 'status-rescheduled', tone: 'warn' },
  ongoing: { text: 'Идёт', icon: 'status-ongoing', tone: 'ok' },
  finished: { text: 'Завершено', icon: 'status-finished', tone: 'off' },
  cancelled: { text: 'Отменено организатором', icon: 'status-cancelled', tone: 'bad' },
  unpublished: { text: 'Снято с публикации модератором', icon: 'action-hide', tone: 'off' },
  deleted: { text: 'Удалено модератором', icon: 'action-delete', tone: 'off' },
};

/** Статусы организации (ТЗ 2.9). Причина отклонения — отдельной строкой на шаге «Решение». */
export const ORGANIZATION_STATUS_VIEW: Record<OrganizationStatus, StatusView> = {
  draft: { text: 'Заполните профиль', icon: 'action-edit', tone: 'off' },
  pending: { text: 'На рассмотрении', icon: 'status-pending', tone: 'wait' },
  needs_changes: { text: 'Нужны правки', icon: 'action-edit', tone: 'warn' },
  approved: { text: 'Допущена к публикации', icon: 'status-confirmed', tone: 'ok' },
  rejected: { text: 'Отклонена', icon: 'status-rejected', tone: 'bad' },
};

/** Статусы сообщения обсуждения (ТЗ 2.7): у скрытых и удалённых — тексты заглушек. */
export const MESSAGE_STATUS_VIEW: Record<MessageStatus, StatusView> = {
  visible: { text: 'Опубликовано', icon: 'action-message', tone: 'ok' },
  hidden_by_moderator: { text: 'Скрыто модератором', icon: 'action-hide', tone: 'off' },
  deleted_by_moderator: { text: 'Удалено модератором', icon: 'action-delete', tone: 'off' },
  deleted_by_author: { text: 'Сообщение удалено автором', icon: 'action-delete', tone: 'off' },
};
