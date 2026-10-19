/** Значение cookie из заголовка `Cookie`; `undefined`, если её нет. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** То немногое от ответа Express, что нужно для cookie сессии. */
export interface CookieResponse {
  cookie(name: string, value: string, options: Record<string, unknown>): unknown;
  clearCookie(name: string, options: Record<string, unknown>): unknown;
}

const cookieOptions = { httpOnly: true, sameSite: 'lax', path: '/' } as const;

export function setSessionCookie(res: CookieResponse, name: string, token: string, maxAge: number) {
  res.cookie(name, token, { ...cookieOptions, maxAge });
}

export function clearSessionCookie(res: CookieResponse, name: string) {
  res.clearCookie(name, cookieOptions);
}
