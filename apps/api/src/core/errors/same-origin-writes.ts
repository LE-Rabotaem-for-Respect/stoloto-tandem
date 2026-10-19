import { ERROR_HTTP_STATUS, errorMessage } from '@tandem/domain';
import type { ErrorCode } from '@tandem/domain';

/** То немногое от запроса и ответа Express, что нужно проверке. */
interface WriteRequest {
  method: string;
  headers: Record<string, string | string[] | undefined>;
}

interface WriteResponse {
  status(code: number): { json(body: unknown): void };
}

const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// none — адрес набран вручную или открыт из закладки, а не со страницы другого сайта
const OWN_SITE = new Set(['same-origin', 'none']);

const header = (request: WriteRequest, name: string): string | undefined => {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
};

function fromOtherSite(request: WriteRequest): boolean {
  const site = header(request, 'sec-fetch-site');
  if (site) return !OWN_SITE.has(site);
  // Старый браузер без Sec-Fetch-Site: сверяем Origin с адресом стенда
  const origin = header(request, 'origin');
  if (origin === undefined) return false;
  try {
    return new URL(origin).host !== header(request, 'host');
  } catch {
    return true;
  }
}

function hasBody(request: WriteRequest): boolean {
  const length = Number(header(request, 'content-length') ?? 0);
  return length > 0 || header(request, 'transfer-encoding') !== undefined;
}

const isJson = (request: WriteRequest) =>
  (header(request, 'content-type') ?? '').split(';')[0]?.trim().toLowerCase() ===
  'application/json';

function reject(response: WriteResponse, code: ErrorCode) {
  response.status(ERROR_HTTP_STATUS[code]).json({ code, message: errorMessage(code) });
}

/**
 * Изменяющие запросы — только со страниц этого же стенда и только с телом
 * JSON. Иначе чужой сайт отправит обычную форму на `/auth/login` и тихо
 * войдёт человеком под аккаунтом атакующего: форму браузер шлёт и с
 * cookie `SameSite=Lax` при переходе, а стенды на разных портах одного
 * адреса для браузера — один сайт.
 */
export function sameOriginWrites() {
  return (request: WriteRequest, response: WriteResponse, next: () => void) => {
    if (!WRITES.has(request.method)) return next();
    if (fromOtherSite(request)) return reject(response, 'cross_site_request');
    if (hasBody(request) && !isJson(request)) return reject(response, 'unsupported_media_type');
    next();
  };
}
