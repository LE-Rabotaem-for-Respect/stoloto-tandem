import { errorMessage } from '@tandem/domain';
import type { ErrorCode } from '@tandem/domain';

/** Поле формы → текст ошибки для человека. */
export type ErrorFields = Record<string, string>;

/**
 * Ошибка с кодом из закрытого списка `@tandem/domain`. Фильтр отдаёт её
 * как `{ code, message, fields? }` с HTTP-кодом из `ERROR_HTTP_STATUS`.
 */
export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    readonly code: ErrorCode,
    readonly fields?: ErrorFields,
    message: string = errorMessage(code),
    /** Через сколько секунд повторить — заголовок `Retry-After` (лимит попыток). */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}
