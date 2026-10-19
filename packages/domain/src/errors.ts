import { TRANSITION_ERROR_CODES } from './state-machines';

const GENERAL_ERROR_CODES = [
  'validation_failed',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'too_large',
  'busy',
  'internal',
] as const;

/** Отказы политик доступа (ТЗ 4.4). */
const POLICY_ERROR_CODES = [
  'event_not_available',
  'event_not_joinable',
  'own_event',
  'users_only',
  'organization_not_approved',
  'not_event_organizer',
  'participants_only',
  'not_organization_owner',
  'admins_only',
] as const;

/** Закрытый список кодов ошибок API: `{ code, message, fields? }` (DECISION-002). */
export const ERROR_CODES = [
  ...GENERAL_ERROR_CODES,
  ...POLICY_ERROR_CODES,
  ...TRANSITION_ERROR_CODES,
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * Текст ошибки по умолчанию. Отказ автомата приходит со своим, более
 * точным текстом (`TransitionError.message`).
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  validation_failed: 'Проверьте поля формы',
  unauthorized: 'Войдите, чтобы продолжить',
  forbidden: 'Недостаточно прав для этого действия',
  not_found: 'Не найдено',
  conflict: 'Такая запись уже есть',
  too_large: 'Слишком большой запрос',
  busy: 'Сервер занят, попробуйте ещё раз',
  internal: 'Что-то пошло не так. Попробуйте ещё раз',
  event_not_available: 'Мероприятие недоступно',
  event_not_joinable: 'Мероприятие недоступно для записи',
  own_event: 'Нельзя записаться на своё мероприятие',
  users_only: 'Записываться могут только пользователи',
  organization_not_approved: 'Организация ещё не допущена администратором',
  not_event_organizer: 'Это может сделать только организатор мероприятия',
  participants_only: 'Информация доступна подтверждённым участникам и организатору',
  not_organization_owner: 'Это может сделать только представитель организации',
  admins_only: 'Доступно только администратору',
  invalid_transition: 'Действие недоступно в текущем статусе',
  already_joined: 'Вы уже записаны на это мероприятие',
  rejected_final: 'Заявка отклонена, подать её повторно нельзя',
  no_seats: 'Мест нет',
  reason_required: 'Укажите причину',
  event_started: 'Мероприятие уже началось',
  start_not_in_future: 'Время начала должно быть в будущем',
};

export const errorMessage = (code: ErrorCode): string => ERROR_MESSAGES[code];
