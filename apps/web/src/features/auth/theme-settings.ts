import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { apiRequest } from '../../shared/api';
import { useTheme } from '../../shared/theme';
import type { ThemeSettings } from '../../shared/theme';
import { ME_KEY, useMe } from './api';
import type { Me } from './api';

/** Оформление, сохранённое в аккаунте (`settings.theme`); чего там нет — то не задано. */
export function savedTheme(settings: unknown): Partial<ThemeSettings> {
  if (typeof settings !== 'object' || settings === null) return {};
  const theme = (settings as { theme?: unknown }).theme;
  if (typeof theme !== 'object' || theme === null) return {};
  const { largeText, contrast } = theme as Record<string, unknown>;
  return {
    ...(typeof largeText === 'boolean' && { largeText }),
    ...(typeof contrast === 'boolean' && { contrast }),
  };
}

const SAVE_THEME_KEY = ['save-theme'] as const;

export const THEME_NOT_SAVED = 'Не сохранилось в аккаунте — выбор остался в этом браузере';

/** Чьё оформление сохраняется: сбой одного аккаунта не показывается другому. */
interface SaveThemeVariables {
  userId: string;
  patch: Partial<ThemeSettings>;
}

function useSaveTheme() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: SAVE_THEME_KEY,
    mutationFn: ({ patch }: SaveThemeVariables) =>
      apiRequest<Me>('/me/settings', { method: 'PATCH', body: patch }),
    onSuccess: (me) => client.setQueryData(ME_KEY, me),
  });
}

/** Последнее сохранение оформления этого аккаунта не удалось. */
function useLastSaveFailed(userId: string | undefined): boolean {
  const saves = useMutationState({
    filters: { mutationKey: SAVE_THEME_KEY },
    select: (mutation) => ({
      status: mutation.state.status,
      userId: (mutation.state.variables as SaveThemeVariables | undefined)?.userId,
    }),
  });
  const last = saves.filter((save) => save.userId === userId).at(-1);
  return Boolean(userId) && last?.status === 'error';
}

/**
 * Последнее сохранение оформления в аккаунт не удалось — общее для шапки и профиля:
 * переключатели в них разные, а сообщение о сбое должно быть видно у любого. Гостю и
 * другому аккаунту после выхода оно не показывается.
 */
export function useThemeSaveFailed(): boolean {
  const me = useMe();
  return useLastSaveFailed(me.data?.id);
}

/**
 * Переключатели «Крупный текст» и «Высокий контраст» (ТЗ 2.8): выбор сразу виден и
 * запоминается в браузере, а у вошедшего — ещё и в аккаунте, чтобы работал на любом
 * устройстве. Не сохранилось в аккаунт — в браузере выбор всё равно остаётся.
 */
export function useThemeSettings() {
  const theme = useTheme();
  const me = useMe();
  const save = useSaveTheme();
  const userId = me.data?.id;
  const failed = useLastSaveFailed(userId);
  const change = (patch: Partial<ThemeSettings>) => {
    const next = { largeText: theme.largeText, contrast: theme.contrast, ...patch };
    theme.setSettings(next);
    // После сбоя в аккаунте могло не сохраниться и прежнее переключение — отправляются оба
    if (userId) save.mutate({ userId, patch: failed ? next : patch });
  };
  return {
    largeText: theme.largeText,
    contrast: theme.contrast,
    toggleLargeText: () => change({ largeText: !theme.largeText }),
    toggleContrast: () => change({ contrast: !theme.contrast }),
  };
}

/**
 * После входа — оформление из аккаунта: сохранённое там важнее выбранного в этом
 * браузере. Применяется один раз на аккаунт, дальше человек переключает сам.
 */
export function useThemeFromAccount() {
  const me = useMe();
  const theme = useTheme();
  const userId = me.data?.id;
  const settings = me.data?.settings;
  const { setSettings, largeText, contrast } = theme;
  // Для какого аккаунта оформление уже применено: дальше человек переключает сам, и его
  // же сохранение не должно возвращать прежнее значение
  const applied = useRef<string | null>(null);
  useEffect(() => {
    if (!userId) {
      applied.current = null;
      return;
    }
    if (applied.current === userId) return;
    applied.current = userId;
    const saved = savedTheme(settings);
    if (Object.keys(saved).length > 0) setSettings({ largeText, contrast, ...saved });
  }, [userId, settings, setSettings, largeText, contrast]);
}
