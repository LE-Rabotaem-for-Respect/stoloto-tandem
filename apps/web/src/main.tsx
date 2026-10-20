import '@fontsource-variable/golos-text';
import '@fontsource-variable/unbounded';
import './shared/theme/tokens.css';
import './shared/theme/base.css';
import './shared/ui/graphics.css';
import './shared/ui/conditions.css';
import './features/navigation/layout.css';
import './features/participations/participations.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyThemeSettings, readThemeSettings } from './shared/theme';

// Тема — до первой отрисовки, чтобы не мигала обычная палитра
applyThemeSettings(readThemeSettings(), document.documentElement);

const root = document.getElementById('root');
if (!root) throw new Error('Не найден элемент #root');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
