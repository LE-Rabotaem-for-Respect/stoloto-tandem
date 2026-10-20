import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/** Две независимые настройки (docs/design.md, «Темы»): их можно включить вместе. */
export interface ThemeSettings {
  largeText: boolean;
  contrast: boolean;
}

const STORAGE_KEY = 'tandem-theme';
const DEFAULT_SETTINGS: ThemeSettings = { largeText: false, contrast: false };

export function readThemeSettings(storage: Pick<Storage, 'getItem'> = localStorage): ThemeSettings {
  try {
    const saved = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}') as Partial<ThemeSettings>;
    return { largeText: saved.largeText === true, contrast: saved.contrast === true };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Атрибуты на `<html>`: по ним токены `shared/theme/tokens.css` выбирают палитру и масштаб. */
export function applyThemeSettings(settings: ThemeSettings, root: HTMLElement) {
  root.dataset.theme = settings.contrast ? 'contrast' : 'default';
  root.dataset.text = settings.largeText ? 'large' : 'normal';
}

/**
 * Светлая или тёмная схема обычной палитры. Своя настройка браузера, а не аккаунта: пока
 * человек не выбрал сам, схема следует системной (`prefers-color-scheme`).
 */
export type ColorScheme = 'light' | 'dark';

const SCHEME_KEY = 'tandem-scheme';

export function readColorScheme(
  storage: Pick<Storage, 'getItem'> = localStorage,
  prefersDark: () => boolean = () =>
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
): ColorScheme {
  try {
    const saved = storage.getItem(SCHEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Без хранилища — как в системе
  }
  return prefersDark() ? 'dark' : 'light';
}

export function applyColorScheme(scheme: ColorScheme, root: HTMLElement) {
  root.dataset.scheme = scheme;
}

interface ThemeContextValue extends ThemeSettings {
  toggleLargeText(): void;
  toggleContrast(): void;
  /** Настройки целиком — например, сохранённые в аккаунте. */
  setSettings(settings: ThemeSettings): void;
  /** Тёмная схема обычной палитры (в «Высоком контрасте» не действует). */
  dark: boolean;
  toggleDark(): void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(readThemeSettings);
  const [scheme, setScheme] = useState(() => readColorScheme());

  useEffect(() => {
    applyThemeSettings(settings, document.documentElement);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Без хранилища (приватный режим) тема просто не запоминается
    }
  }, [settings]);

  useEffect(() => applyColorScheme(scheme, document.documentElement), [scheme]);

  const toggleLargeText = useCallback(
    () => setSettings((current) => ({ ...current, largeText: !current.largeText })),
    [],
  );
  const toggleContrast = useCallback(
    () => setSettings((current) => ({ ...current, contrast: !current.contrast })),
    [],
  );
  const toggleDark = useCallback(
    () =>
      setScheme((current) => {
        const next = current === 'dark' ? 'light' : 'dark';
        try {
          // Запоминается только выбор человека: без него схема следует системной
          localStorage.setItem(SCHEME_KEY, next);
        } catch {
          // Без хранилища выбор действует до перезагрузки
        }
        return next;
      }),
    [],
  );
  const value = useMemo(
    () => ({
      ...settings,
      toggleLargeText,
      toggleContrast,
      setSettings,
      dark: scheme === 'dark',
      toggleDark,
    }),
    [settings, toggleLargeText, toggleContrast, scheme, toggleDark],
  );
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme вызван вне ThemeProvider');
  return value;
}
