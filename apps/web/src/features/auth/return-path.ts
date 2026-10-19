/** Адрес входа, после которого человек вернётся туда, откуда пришёл (ТЗ 2.6). */
export function loginPath(next: string): string {
  return next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`;
}

/** Куда вернуться после входа: только путь этого же сайта, иначе — на главную. */
export function safeNext(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return '/';
  }
  return value;
}

/** Текущий адрес с добавленным параметром — чтобы после входа продолжить действие. */
export function withParam(pathname: string, search: string, name: string, value: string): string {
  const params = new URLSearchParams(search);
  params.set(name, value);
  return `${pathname}?${params.toString()}`;
}
