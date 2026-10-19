import { ApiError } from '../../core/errors';

export interface Limit {
  /** Сколько попыток разрешено за окно. */
  attempts: number;
  windowMs: number;
}

/** Лимиты входа и регистрации; в тестах подменяются. */
export interface AuthLimits {
  loginPerIp: Limit;
  loginPerEmail: Limit;
  registerPerIp: Limit;
  registerPerEmail: Limit;
}

export const AUTH_LIMITS = Symbol('AUTH_LIMITS');

const MINUTE = 60_000;

/**
 * С запасом для экспертов за одним NAT, но перебор паролей и поток argon2
 * останавливаются: на сервере 2 CPU и три стенда.
 */
export const DEFAULT_AUTH_LIMITS: AuthLimits = {
  loginPerIp: { attempts: 30, windowMs: 10 * MINUTE },
  loginPerEmail: { attempts: 10, windowMs: 10 * MINUTE },
  registerPerIp: { attempts: 10, windowMs: 60 * MINUTE },
  registerPerEmail: { attempts: 5, windowMs: 60 * MINUTE },
};

/** Сколько ключей держит один счётчик; сверх — забываются самые старые окна. */
export const MAX_KEYS = 10_000;

interface Window {
  startedAt: number;
  count: number;
}

/**
 * Счётчик попыток с фиксированным окном, в памяти процесса: на стенд один
 * процесс api (DECISION-002). Время — настоящее, без демо-сдвига: перемотка
 * демо-часов не должна ни снимать, ни продлевать блокировку.
 */
export class AttemptLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly limit: Limit,
    private readonly now: () => number,
    private readonly maxKeys = MAX_KEYS,
  ) {}

  /** Засчитывает попытку; сверх лимита — 429 с `Retry-After`. */
  hit(key: string) {
    const now = this.now();
    this.forgetExpired(now);
    const window = this.windows.get(key);
    if (!window || now - window.startedAt >= this.limit.windowMs) {
      // Новое окно — в конец: окна в Map идут по времени начала, старые всегда впереди
      this.windows.delete(key);
      if (this.windows.size >= this.maxKeys) this.forgetOldest();
      this.windows.set(key, { startedAt: now, count: 1 });
      return;
    }
    if (window.count >= this.limit.attempts) {
      const retryAfter = Math.ceil((window.startedAt + this.limit.windowMs - now) / 1000);
      const minutes = Math.max(1, Math.ceil(retryAfter / 60));
      throw new ApiError(
        'too_many_requests',
        undefined,
        `Слишком много попыток. Попробуйте через ${minutes} мин`,
        retryAfter,
      );
    }
    window.count += 1;
  }

  // Истёкшие окна — в начале Map: перебор останавливается на первом живом
  private forgetExpired(now: number) {
    for (const [key, window] of this.windows) {
      if (now - window.startedAt < this.limit.windowMs) return;
      this.windows.delete(key);
    }
  }

  private forgetOldest() {
    const oldest = this.windows.keys().next();
    if (!oldest.done) this.windows.delete(oldest.value);
  }
}
