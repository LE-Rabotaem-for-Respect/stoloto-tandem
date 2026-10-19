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
  if (url.origin !== origin) return '/';
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
