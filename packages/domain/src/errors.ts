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
  'invalid_credentials',
  'unsupported_media_type',
  'cross_site_request',
  'too_many_requests',
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
  'not_message_author',
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
  invalid_credentials: 'Неверная почта или пароль',
  unsupported_media_type: 'Неподдерживаемый формат данных',
  cross_site_request: 'Запрос с другого сайта отклонён',
  too_many_requests: 'Слишком много попыток. Попробуйте позже',
  event_not_available: 'Мероприятие недоступно',
  event_not_joinable: 'Мероприятие недоступно для записи',
  own_event: 'Нельзя записаться на своё мероприятие',
  users_only: 'Записываться могут только пользователи',
  organization_not_approved: 'Организация ещё не допущена администратором',
  not_event_organizer: 'Это может сделать только организатор мероприятия',
  participants_only: 'Информация доступна подтверждённым участникам и организатору',
  not_organization_owner: 'Это может сделать только представитель организации',
  admins_only: 'Доступно только администратору',
  not_message_author: 'Это может сделать только автор сообщения',
  invalid_transition: 'Действие недоступно в текущем статусе',
  already_joined: 'Вы уже записаны на это мероприятие',
  rejected_final: 'Заявка отклонена, подать её повторно нельзя',
  no_seats: 'Мест нет',
  reason_required: 'Укажите причину',
  event_started: 'Мероприятие уже началось',
  start_not_in_future: 'Время начала должно быть в будущем',
};

export const errorMessage = (code: ErrorCode): string => ERROR_MESSAGES[code];

/**
 * HTTP-код каждой ошибки: 400 — неверные данные, 401 — нужен вход,
 * 403 — нет прав, 404 — нет объекта, 409 — конфликт с состоянием,
 * 413 — слишком большое тело, 415 — тело не в формате JSON, 429 — лимит попыток, 503 — база занята, 500 — непредвиденное.
 */
export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  validation_failed: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  too_large: 413,
  busy: 503,
  internal: 500,
  invalid_credentials: 401,
  unsupported_media_type: 415,
  cross_site_request: 403,
  too_many_requests: 429,
  event_not_available: 404,
  event_not_joinable: 409,
  own_event: 403,
  users_only: 403,
  organization_not_approved: 403,
  not_event_organizer: 403,
  participants_only: 403,
  not_organization_owner: 403,
  admins_only: 403,
  not_message_author: 403,
  invalid_transition: 409,
  already_joined: 409,
  rejected_final: 409,
  no_seats: 409,
  reason_required: 400,
  event_started: 409,
  start_not_in_future: 400,
};
