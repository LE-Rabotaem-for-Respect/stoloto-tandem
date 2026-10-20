import { useLayoutEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import type { IconName } from '../../shared/illustrations';
import { Icon } from '../../shared/ui/Icon';
import {
  THEME_NOT_SAVED,
  loginPath,
  returnPath,
  useLogout,
  useMe,
  usePendingActionRelay,
  useThemeFromAccount,
  useThemeSaveFailed,
  useThemeSettings,
} from '../auth';
import { DemoPanel } from '../demo';
import { UnreadBadge } from '../notifications';

/** Пять пунктов (ТЗ 2.8): нижняя панель на мобильном, верхнее меню на компьютере. */
// Мягкий перенос: слово, которое не помещается в пятую часть ширины, переносится по
// слогам с дефисом (docs/design.md, «Нижняя панель»)
const SHY = String.fromCharCode(0xad);

export const NAV_ITEMS: readonly {
  to: string;
  label: string;
  icon: IconName;
  /** Подпись с местами переноса — только для показа; имя ссылки — `label`. */
  hyphenated?: string;
}[] = [
  { to: '/', label: 'Найти', icon: 'action-search' },
  { to: '/my', label: 'Мои записи', icon: 'action-calendar' },
  { to: '/create', label: 'Создать', icon: 'action-create' },
  {
    to: '/notifications',
    label: 'Уведомления',
    icon: 'action-notify',
    hyphenated: `Уведом${SHY}ле${SHY}ния`,
  },
  { to: '/profile', label: 'Профиль', icon: 'action-profile', hyphenated: `Про${SHY}филь` },
];

function ThemeSwitches() {
  const theme = useThemeSettings();
  return (
    <div className="theme-switches">
      <button
        className="header-button"
        type="button"
        aria-pressed={theme.largeText}
        onClick={theme.toggleLargeText}
      >
        А+<span className="visually-hidden"> Крупный текст</span>
      </button>
      <button
        className="header-button"
        type="button"
        aria-pressed={theme.contrast}
        onClick={theme.toggleContrast}
      >
        <Icon name="action-contrast" />
        <span className="header-button-label">Контраст</span>
      </button>
    </div>
  );
}

/**
 * Сбой сохранения оформления в аккаунт — под шапкой, где переключатели. В профиле то же
 * сообщение стоит у «Оформления», второй раз его не повторяем.
 */
function ThemeSaveError() {
  const failed = useThemeSaveFailed();
  const { pathname } = useLocation();
  if (!failed || pathname === '/profile') return null;
  return (
    <p className="form-error theme-save-error" role="alert">
      {THEME_NOT_SAVED}
    </p>
  );
}

/** В шапке всегда видно, под кем вход, и есть «Сменить аккаунт» (ТЗ 2.6). */
function Account() {
  const me = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();

  if (me.isPending) return null;
  if (me.isError) {
    return (
      <button className="header-link" type="button" onClick={() => void me.refetch()}>
        Нет связи — повторить
      </button>
    );
  }
  if (!me.data) {
    return (
      <Link className="header-link" to={loginPath(returnPath(location.pathname, location.search))}>
        Войти
      </Link>
    );
  }
  const who = me.data.organization?.name ?? me.data.name;
  const switchAccount = () =>
    logout.mutate(undefined, {
      onSuccess: () => void navigate(loginPath(returnPath(location.pathname, location.search))),
    });

  return (
    <div className="account">
      <span className="account-name" title={who}>
        <span className="visually-hidden">Вы вошли как </span>
        {who}
      </span>
      <button
        className="header-link"
        type="button"
        onClick={switchAccount}
        disabled={logout.isPending}
      >
        Сменить аккаунт
      </button>
      {logout.isError && (
        <span className="account-error" role="alert">
          Не удалось выйти. Попробуйте ещё раз
        </span>
      )}
    </div>
  );
}

/**
 * Высота прилипающей шапки — в `--app-top-height` для `scroll-padding-top`: она
 * меняется с шириной экрана, темой «Крупный текст» и длиной имени аккаунта.
 */
function useStickyTopHeight() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const top = ref.current;
    if (!top) return;
    const root = document.documentElement.style;
    const update = () =>
      root.setProperty('--app-top-height', `${Math.ceil(top.getBoundingClientRect().height)}px`);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(top);
    return () => observer.disconnect();
  }, []);
  return ref;
}

export function AppLayout() {
  usePendingActionRelay();
  useThemeFromAccount();
  const top = useStickyTopHeight();
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Перейти к содержимому
      </a>
      <div className="app-top" ref={top}>
        <header className="app-header">
          <Link className="brand" to="/">
            Тандем
          </Link>
          <ThemeSwitches />
          <Account />
        </header>
        <nav className="main-nav" aria-label="Основные разделы">
          <ul>
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} end={item.to === '/'} className="main-nav-link">
                  <Icon name={item.icon} />
                  {item.hyphenated ? (
                    <>
                      <span aria-hidden="true">{item.hyphenated}</span>
                      <span className="visually-hidden">{item.label}</span>
                    </>
                  ) : (
                    <span>{item.label}</span>
                  )}
                  {item.to === '/notifications' && <UnreadBadge />}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <DemoPanel />
      <main id="main" className="app-main" tabIndex={-1}>
        {/* В потоке страницы, а не в прилипающей шапке: не отнимает первый экран */}
        <ThemeSaveError />
        <Outlet />
      </main>
    </div>
  );
}
