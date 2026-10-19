import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import type { IconName } from '../../shared/illustrations';
import { useTheme } from '../../shared/theme';
import { Icon } from '../../shared/ui/Icon';
import { loginPath, returnPath, useLogout, useMe } from '../auth';

/** Пять пунктов (ТЗ 2.8): нижняя панель на мобильном, верхнее меню на компьютере. */
export const NAV_ITEMS: readonly { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Найти', icon: 'action-search' },
  { to: '/my', label: 'Мои записи', icon: 'action-calendar' },
  { to: '/create', label: 'Создать', icon: 'action-create' },
  { to: '/notifications', label: 'Уведомления', icon: 'action-notify' },
  { to: '/profile', label: 'Профиль', icon: 'action-profile' },
];

function ThemeSwitches() {
  const theme = useTheme();
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
      <span className="account-name">
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

export function AppLayout() {
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Перейти к содержимому
      </a>
      <div className="app-top">
        <header className="app-header">
          <Link className="brand" to="/">
            Спорт вместе
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
                  <span>{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <main id="main" className="app-main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
