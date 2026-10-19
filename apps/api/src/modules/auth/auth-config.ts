/** Настройки входа из окружения стенда (DECISION-002, «Развёртывание»). */
export interface AuthConfig {
  /** Ключ HMAC для хешей токенов сессий; у каждого стенда свой. */
  sessionSecret: string;
  /** Имя cookie с номером стенда: стенды на разных портах одного адреса делят cookie. */
  cookieName: string;
  sessionTtlMs: number;
}

export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

const MIN_SECRET_LENGTH = 32;
// Заглушка из примеров окружения: с ней api не стартует
const PLACEHOLDER_SECRETS = new Set(['change-me', 'changeme', 'secret']);

export function loadAuthConfig(env: Record<string, string | undefined> = process.env): AuthConfig {
  const secret = env.SESSION_SECRET?.trim() ?? '';
  if (secret.length < MIN_SECRET_LENGTH || PLACEHOLDER_SECRETS.has(secret.toLowerCase())) {
    throw new Error(
      `Переменная окружения SESSION_SECRET не задана или слишком короткая (нужно не меньше ${MIN_SECRET_LENGTH} символов). ` +
        "Сгенерируйте её, например: node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\"",
    );
  }
  const stand = env.STAND_ID?.trim().replace(/[^A-Za-z0-9_-]/g, '') ?? '';
  return {
    sessionSecret: secret,
    cookieName: stand ? `tandem_session_${stand}` : 'tandem_session',
    sessionTtlMs: 30 * 24 * 60 * 60 * 1000,
  };
}
