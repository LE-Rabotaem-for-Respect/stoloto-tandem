/** Настройки стенда из окружения (DECISION-002, «Развёртывание»). */
export interface StandConfig {
  /** Демо-часы, сброс и быстрый вход; включает только `DEMO_MODE=true`. */
  demoMode: boolean;
  /** Номер стенда (`stand-1` …), показывается в демо-панели. */
  standId: string | null;
}

export const STAND_CONFIG = Symbol('STAND_CONFIG');

export function loadStandConfig(
  env: Record<string, string | undefined> = process.env,
): StandConfig {
  return {
    demoMode: env.DEMO_MODE === 'true',
    standId: env.STAND_ID?.trim() || null,
  };
}
