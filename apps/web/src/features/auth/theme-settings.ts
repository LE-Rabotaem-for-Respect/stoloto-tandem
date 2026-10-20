import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { apiRequest } from '../../shared/api';
import { useTheme } from '../../shared/theme';
import type { ThemeSettings } from '../../shared/theme';
import { ME_KEY, SAVE_THEME_KEY, useMe } from './api';
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
    // Сбой помнится, пока вход не сменился (forgetThemeSaves), а не 5 минут по умолчанию:
    // иначе сообщение пропадёт, а настройка так и останется несохранённой
    gcTime: Infinity,
    mutationFn: ({ patch }: SaveThemeVariables) =>
      apiRequest<Me>('/me/settings', { method: 'PATCH', body: patch }),
    // Опоздавший ответ прежнего аккаунта (вышел или вошёл другой) не пишет его профиль
    // в кеш: иначе шапка снова покажет того, кто уже вышел
    onSuccess: (me, { userId }) => {
      if (client.getQueryData<Me | null>(ME_KEY)?.id === userId) client.setQueryData(ME_KEY, me);
    },
  });
}

/**
 * В аккаунте этого человека осталась несохранённая настройка: сохранение не удалось,
 * и ни одно начатое после него удачное сохранение её не записало. Сравнение — по
 * настройкам, а не по последнему ответу: при двух сохранениях подряд сбой первого
 * может прийти уже после успеха второго.
 */
function useUnsavedKeys(userId: string | undefined): (keyof ThemeSettings)[] {
  const saves = useMutationState({
    filters: { mutationKey: SAVE_THEME_KEY },
    select: (mutation) => ({
      status: mutation.state.status,
      ...(mutation.state.variables as SaveThemeVariables | undefined),
    }),
  });
  if (!userId) return [];
  const own = saves.filter((save) => save.userId === userId);
  const unsaved = new Set<keyof ThemeSettings>();
  own.forEach((save, index) => {
    if (save.status !== 'error') return;
    for (const key of Object.keys(save.patch ?? {}) as (keyof ThemeSettings)[]) {
      const savedLater = own
        .slice(index + 1)
        .some((later) => later.status === 'success' && key in (later.patch ?? {}));
      if (!savedLater) unsaved.add(key);
    }
  });
  return [...unsaved];
}

/**
 * Последнее сохранение оформления в аккаунт не удалось — общее для шапки и профиля:
 * переключатели в них разные, а сообщение о сбое должно быть видно у любого. Гостю и
 * другому аккаунту после выхода оно не показывается.
 */
export function useThemeSaveFailed(): boolean {
  const me = useMe();
  return useUnsavedKeys(me.data?.id).length > 0;
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
  const unsaved = useUnsavedKeys(userId);
  const change = (patch: Partial<ThemeSettings>) => {
    const next = { largeText: theme.largeText, contrast: theme.contrast, ...patch };
    theme.setSettings(next);
    // Вместе с новым выбором — только то, что раньше не сохранилось: остальное могли
    // поменять на другом устройстве, и прежнее значение отсюда его перезаписало бы
    const retry = Object.fromEntries(unsaved.map((key) => [key, next[key]]));
    if (userId) save.mutate({ userId, patch: { ...retry, ...patch } });
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
