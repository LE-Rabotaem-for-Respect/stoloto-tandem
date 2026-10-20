/** Адрес входа, после которого человек вернётся туда, откуда пришёл (ТЗ 2.6). */
export function loginPath(next: string): string {
  return next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`;
}

/**
 * Куда вернуться после входа: только адрес этого же сайта, иначе — на главную.
 * Адрес разбирается так же, как его разберёт браузер (табы и переводы строки
 * выбрасываются, обратная косая черта считается прямой), и сверяется по origin,
 * а не по началу строки.
 */
export function safeNext(value: string | null): string {
  if (!value?.startsWith('/')) return '/';
  const origin = window.location.origin;
  let url: URL;
  try {
    url = new URL(value, origin);
  } catch {
    return '/';
  }
  // После схлопывания точек («/.//хост», «/a/..//хост») путь может начаться с «//»:
  // такой адрес браузер и роутер считают адресом другого сайта
  if (url.origin !== origin || url.pathname.startsWith('//')) return '/';
  return url.pathname + url.search + url.hash;
}

const AUTH_PAGES = new Set(['/login', '/register']);

/**
 * Куда вернуться после входа с текущей страницы. На экранах входа и регистрации
 * это уже заданный `next`, а не сам экран — иначе после входа человек снова
 * увидит форму, а `next` вложится сам в себя.
 */
export function returnPath(pathname: string, search: string): string {
  if (AUTH_PAGES.has(pathname)) return safeNext(new URLSearchParams(search).get('next'));
  return pathname + search;
}

/**
 * Действие гостя, ради которого он пошёл на вход: страница, имя действия и номер,
 * который выдала вкладка в момент клика (`issuePendingAction`).
 */
export interface PendingAction {
  path: string;
  intent: string;
  token: number;
}

/**
 * Отложенное действие из `state` навигации. Его кладёт только клик гостя и
 * передаёт дальше только успешный вход: внешняя ссылка `state` задать не может.
 * Запись истории с действием остаётся, если гость ушёл со входа, — поэтому каркас
 * принимает действие только с номером, который вкладка выдала последним
 * (`issuePendingAction`), и один раз.
 */
export function pendingActionFrom(state: unknown): PendingAction | null {
  if (typeof state !== 'object' || state === null) return null;
  const pending: unknown = (state as { pendingAction?: unknown }).pendingAction;
  if (typeof pending !== 'object' || pending === null) return null;
  const { path, intent, token } = pending as Record<string, unknown>;
  return typeof path === 'string' && typeof intent === 'string' && typeof token === 'number'
    ? { path, intent, token }
    : null;
}
