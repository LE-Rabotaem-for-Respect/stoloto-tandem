/**
 * Что показывать вместо внешней ссылки (сайт организации): хост, как его разбирает
 * браузер — в punycode и без данных входа. «vк.com» с кириллической «к» станет
 * «xn--v-ttb.com», и подмену видно. Не ссылка http(s) — `null`, её не показываем.
 */
export function linkHost(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  return parsed.hostname;
}
