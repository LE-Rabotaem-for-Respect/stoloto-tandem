/** Настройки стенда из окружения (DECISION-002, «Развёртывание»). */
export interface StandConfig {
  /** Демо-часы, сброс и быстрый вход; включает только `DEMO_MODE=true`. */
  demoMode: boolean;
  /** Номер стенда (`stand-1` …), показывается в демо-панели. */
  standId: string | null;
  /**
   * Минимальный интервал между сбросами демо-данных, секунды. Сброс — тяжёлая
   * транзакция, а сервер общий для трёх стендов. Без значения интервала нет:
   * так задают его тесты; api берёт его из окружения, по умолчанию 10 с.
   */
  demoResetIntervalSeconds?: number;
}

const DEFAULT_RESET_INTERVAL_SECONDS = 10;

function resetInterval(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_RESET_INTERVAL_SECONDS;
  const seconds = Number(raw);
  if (!Number.isInteger(seconds) || seconds < 0) {
    throw new Error('DEMO_RESET_INTERVAL_SECONDS — целое число секунд, не меньше 0');
  }
  return seconds;
}

export const STAND_CONFIG = Symbol('STAND_CONFIG');

export function loadStandConfig(
  env: Record<string, string | undefined> = process.env,
): StandConfig {
  return {
    demoMode: env.DEMO_MODE === 'true',
    standId: env.STAND_ID?.trim() || null,
    demoResetIntervalSeconds: resetInterval(env.DEMO_RESET_INTERVAL_SECONDS),
  };
}
