import { TIME_ZONE } from './time';

/**
 * Закрытый список типов уведомлений (ТЗ 3.3). Он отдельно от доменных
 * событий: одно событие даёт разные уведомления разным людям, а у некоторых
 * уведомлений (Хелфигочи) события нет вовсе.
 */
export const NOTIFICATION_TYPES = [
  /** Организатору: новая заявка. */
  'participation_requested',
  /** Организатору: новый вопрос в обсуждении. */
  'question_posted',
  /** Организатору: участник отменил запись — освободилось место. */
  'seat_freed',
  /** Участнику: заявка принята. */
  'participation_confirmed',
  /** Участнику: заявка отклонена. */
  'participation_rejected',
  /** Участнику: место освободилось, он перешёл из листа ожидания в участники. */
  'participation_promoted',
  /** Автору вопроса: организатор ответил. */
  'answer_posted',
  /** Записавшимся и организатору: перенос. */
  'event_rescheduled',
  /** Записавшимся и организатору: отмена организатором. */
  'event_cancelled',
  /** Записавшимся и организатору: снятие модератором. */
  'event_unpublished',
  /** Записавшимся и организатору: удаление модератором. */
  'event_deleted',
  /** Представителю организации: решение администратора. */
  'organization_decided',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Что хранится в `Notification.payload`: из этого собирается одна строка. */
export interface NotificationPayload {
  eventTitle?: string;
  /** Новое начало при переносе, ISO. */
  startsAt?: string;
  organizationName?: string;
  decision?: 'approved' | 'rejected' | 'needs_changes';
  reason?: string;
}

export const isNotificationType = (value: string): value is NotificationType =>
  (NOTIFICATION_TYPES as readonly string[]).includes(value);

const dateTime = new Intl.DateTimeFormat('ru-RU', {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

const quoted = (title?: string) => `«${title ?? 'мероприятие'}»`;
const withReason = (text: string, reason?: string) =>
  reason ? `${text}. Причина: ${reason}` : text;

const TEXT: Record<NotificationType, (payload: NotificationPayload) => string> = {
  participation_requested: (p) => `Новая заявка на ${quoted(p.eventTitle)}`,
  question_posted: (p) => `Новый вопрос в обсуждении ${quoted(p.eventTitle)}`,
  participation_confirmed: (p) => `Заявка на ${quoted(p.eventTitle)} принята — вы участник`,
  participation_rejected: (p) =>
    withReason(`Заявка на ${quoted(p.eventTitle)} отклонена`, p.reason),
  participation_promoted: (p) => `Освободилось место: вы участник ${quoted(p.eventTitle)}`,
  seat_freed: (p) => `Освободилось место в ${quoted(p.eventTitle)}: участник отменил запись`,
  answer_posted: (p) => `Организатор ответил на ваш вопрос в ${quoted(p.eventTitle)}`,
  event_rescheduled: (p) =>
    p.startsAt
      ? `${quoted(p.eventTitle)} перенесено на ${dateTime.format(new Date(p.startsAt))}`
      : `${quoted(p.eventTitle)} перенесено`,
  event_cancelled: (p) => withReason(`${quoted(p.eventTitle)} отменено организатором`, p.reason),
  event_unpublished: (p) =>
    withReason(`${quoted(p.eventTitle)} снято с публикации модератором`, p.reason),
  event_deleted: (p) => withReason(`${quoted(p.eventTitle)} удалено модератором`, p.reason),
  organization_decided: (p) => {
    const name = quoted(p.organizationName);
    if (p.decision === 'approved') return `Организация ${name} допущена: публикуйте события`;
    if (p.decision === 'needs_changes') {
      return withReason(`Организации ${name} нужны правки профиля`, p.reason);
    }
    return withReason(`Заявка организации ${name} отклонена`, p.reason);
  },
};

/** Одна строка уведомления (ТЗ 2.11): подробности — на целевом экране. */
export const notificationText = (type: NotificationType, payload: NotificationPayload): string =>
  TEXT[type](payload);

/** Пиктограмма типа — имя из набора `ICONS` web. */
export const NOTIFICATION_ICON: Record<NotificationType, string> = {
  participation_requested: 'status-pending',
  question_posted: 'action-message',
  seat_freed: 'action-leave',
  participation_confirmed: 'status-confirmed',
  participation_rejected: 'status-rejected',
  participation_promoted: 'status-confirmed',
  answer_posted: 'action-message',
  event_rescheduled: 'status-rescheduled',
  event_cancelled: 'status-event-cancelled',
  event_unpublished: 'action-hide',
  event_deleted: 'action-delete',
  organization_decided: 'action-profile',
};
