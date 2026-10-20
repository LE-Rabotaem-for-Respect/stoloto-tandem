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

function useSaveTheme() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: SAVE_THEME_KEY,
    mutationFn: (patch: Partial<ThemeSettings>) =>
      apiRequest<Me>('/me/settings', { method: 'PATCH', body: patch }),
    onSuccess: (me) => client.setQueryData(ME_KEY, me),
  });
}

/**
 * Последнее сохранение оформления в аккаунт не удалось — общее для шапки и профиля:
 * переключатели в них разные, а сообщение о сбое должно быть видно у любого.
 */
export function useThemeSaveFailed(): boolean {
  const statuses = useMutationState({
    filters: { mutationKey: SAVE_THEME_KEY },
    select: (mutation) => mutation.state.status,
  });
  return statuses.at(-1) === 'error';
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
  const change = (patch: Partial<ThemeSettings>) => {
    theme.setSettings({ largeText: theme.largeText, contrast: theme.contrast, ...patch });
    if (me.data) save.mutate(patch);
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
