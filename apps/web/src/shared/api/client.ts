/** Ошибка API в едином формате `{ code, message, fields? }` (DECISION-002). */
export class ApiRequestError extends Error {
  override readonly name = 'ApiRequestError';

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

const NETWORK_MESSAGE = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз';
const UNKNOWN_MESSAGE = 'Что-то пошло не так. Попробуйте ещё раз';

interface ErrorBody {
  code?: unknown;
  message?: unknown;
  fields?: unknown;
}

function isFields(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every((text) => typeof text === 'string')
  );
}

async function toError(response: Response): Promise<ApiRequestError> {
  const body = (await response.json().catch(() => ({}))) as ErrorBody;
  return new ApiRequestError(
    response.status,
    typeof body.code === 'string' ? body.code : 'internal',
    typeof body.message === 'string' ? body.message : UNKNOWN_MESSAGE,
    isFields(body.fields) ? body.fields : {},
  );
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
}

/**
 * Запрос к api того же адреса (`/api` проксирует nginx стенда или Vite).
 * Cookie сессии уходит сама; ошибка — `ApiRequestError` с текстом для человека.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiRequestError(0, 'network', NETWORK_MESSAGE);
  }
  if (!response.ok) throw await toError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
