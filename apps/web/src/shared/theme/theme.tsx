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

interface ThemeContextValue extends ThemeSettings {
  toggleLargeText(): void;
  toggleContrast(): void;
  /** Настройки целиком — например, сохранённые в аккаунте. */
  setSettings(settings: ThemeSettings): void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(readThemeSettings);

  useEffect(() => {
    applyThemeSettings(settings, document.documentElement);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Без хранилища (приватный режим) тема просто не запоминается
    }
  }, [settings]);

  const toggleLargeText = useCallback(
    () => setSettings((current) => ({ ...current, largeText: !current.largeText })),
    [],
  );
  const toggleContrast = useCallback(
    () => setSettings((current) => ({ ...current, contrast: !current.contrast })),
    [],
  );
  const value = useMemo(
    () => ({ ...settings, toggleLargeText, toggleContrast, setSettings }),
    [settings, toggleLargeText, toggleContrast],
  );
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme вызван вне ThemeProvider');
  return value;
}
