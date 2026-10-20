import '@fontsource-variable/golos-text';
import '@fontsource-variable/rubik';
import '@fontsource-variable/caveat';
import './shared/theme/tokens.css';
import './shared/theme/base.css';
import './shared/ui/graphics.css';
import './shared/ui/conditions.css';
import './features/navigation/layout.css';
import './features/event-card/event-card.css';
import './features/events/events.css';
import './features/feed/feed.css';
import './features/participations/participations.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import {
  applyColorScheme,
  applyThemeSettings,
  readColorScheme,
  readThemeSettings,
} from './shared/theme';

// Тема — до первой отрисовки, чтобы не мигала обычная палитра
applyThemeSettings(readThemeSettings(), document.documentElement);
applyColorScheme(readColorScheme(), document.documentElement);

const root = document.getElementById('root');
if (!root) throw new Error('Не найден элемент #root');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
