import { useEffect, useRef } from 'react';
import { THEME_NOT_SAVED, useThemeSaveFailed, useThemeSettings } from './theme-settings';

/** «Оформление» в профиле (ТЗ 2.8): те же переключатели, что в шапке, с полными подписями. */
export function AppearanceSettings() {
  const theme = useThemeSettings();
  const failed = useThemeSaveFailed();
  const message = useRef<HTMLParagraphElement>(null);
  // В «Крупном тексте» с длинным именем раздел ниже первого экрана: сбой прокручивается
  // в видимую область, иначе сообщение остаётся под нижней панелью
  useEffect(() => {
    if (failed) message.current?.scrollIntoView?.({ block: 'nearest' });
  }, [failed]);
  return (
    <section className="appearance" aria-labelledby="appearance-title">
      <h2 id="appearance-title">Оформление</h2>
      {/* Над кнопками: в «Крупном тексте» под ними сообщение ушло бы под нижнюю панель */}
      {failed && (
        <p className="form-error appearance-error" role="alert" ref={message}>
          {THEME_NOT_SAVED}
        </p>
      )}
      <div className="appearance-options">
        <button
          className="button"
          type="button"
          aria-pressed={theme.largeText}
          onClick={theme.toggleLargeText}
        >
          Крупный текст
        </button>
        <button
          className="button"
          type="button"
          aria-pressed={theme.contrast}
          onClick={theme.toggleContrast}
        >
          Высокий контраст
        </button>
      </div>
      {!failed && (
        <p className="appearance-hint">
          Выбор запоминается в аккаунте и работает на любом устройстве.
        </p>
      )}
    </section>
  );
}
