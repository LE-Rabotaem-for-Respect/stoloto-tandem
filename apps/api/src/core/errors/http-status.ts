import type { ErrorCode } from '@tandem/domain';

/**
 * HTTP-код каждой ошибки: 400 — неверные данные, 401 — нужен вход,
 * 403 — нет прав, 404 — нет объекта, 409 — конфликт с состоянием,
 * 413 — слишком большое тело, 503 — база занята, 500 — непредвиденное.
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
  event_not_available: 404,
  event_not_joinable: 409,
  own_event: 403,
  users_only: 403,
  organization_not_approved: 403,
  not_event_organizer: 403,
  participants_only: 403,
  not_organization_owner: 403,
  admins_only: 403,
  invalid_transition: 409,
  already_joined: 409,
  rejected_final: 409,
  no_seats: 409,
  reason_required: 400,
  event_started: 409,
  start_not_in_future: 400,
};
