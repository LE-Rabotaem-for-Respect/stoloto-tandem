import { useThemeSettings } from './theme-settings';

/** «Оформление» в профиле (ТЗ 2.8): те же переключатели, что в шапке, с полными подписями. */
export function AppearanceSettings() {
  const theme = useThemeSettings();
  return (
    <section className="appearance" aria-labelledby="appearance-title">
      <h2 id="appearance-title">Оформление</h2>
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
      <p className="appearance-hint">
        Выбор запоминается в аккаунте и работает на любом устройстве.
      </p>
    </section>
  );
}
