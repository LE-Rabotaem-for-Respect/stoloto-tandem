import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useMe } from './api';
import { loginPath } from './return-path';

/** Раздел только для вошедших: гостя отправляет на вход и возвращает сюда же. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <p role="status">Загрузка…</p>;
  // Сбой связи — не повод считать человека гостем и уводить его на вход
  if (me.isError) {
    return (
      <div role="alert">
        <p>Не удалось проверить вход: нет связи с сервером.</p>
        <button className="button" type="button" onClick={() => void me.refetch()}>
          Повторить
        </button>
      </div>
    );
  }
  if (!me.data) return <Navigate to={loginPath(location.pathname + location.search)} replace />;
  return children;
}

const PENDING_KEY = 'tandem-pending-action';

interface PendingAction {
  path: string;
  intent: string;
}

function rememberAction(pending: PendingAction) {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // Хранилище недоступно — после входа человек нажмёт кнопку сам
  }
}

/**
 * Забирает отложенное действие, если его оставил клик гостя на этой странице
 * в этой вкладке. Метка одноразовая: вошедший человек на другой странице её
 * просто выбрасывает — брошенный когда-то вход не запустит действие позже.
 */
function takeAction(path: string, intent: string): boolean {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return false;
    const pending = JSON.parse(raw) as Partial<PendingAction>;
    // Метку для другого действия этой же страницы забирает его собственный хук
    if (pending.path === path && pending.intent !== intent) return false;
    sessionStorage.removeItem(PENDING_KEY);
    return pending.path === path;
  } catch {
    return false;
  }
}

/**
 * Действие, которое гостю сначала предлагает войти (ТЗ 2.6). Клик гостя
 * запоминает действие в этой вкладке и ведёт на вход; вернувшись уже вошедшим,
 * страница выполняет то же действие сама. Адрес страницы действие не запускает:
 * ссылка, присланная вошедшему человеку, ничего не сделает за него.
 */
export function useAuthAction(intent: string, action: () => void): () => void {
  const me = useMe();
  const location = useLocation();
  const navigate = useNavigate();
  const latest = useRef(action);

  useEffect(() => {
    latest.current = action;
  });

  const signedIn = Boolean(me.data);
  const { pathname, search } = location;
  useEffect(() => {
    if (signedIn && takeAction(pathname, intent)) latest.current();
  }, [signedIn, pathname, intent]);

  return () => {
    if (signedIn) {
      action();
      return;
    }
    rememberAction({ path: pathname, intent });
    void navigate(loginPath(pathname + search));
  };
}
