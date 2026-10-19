import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useMe } from './api';
import { loginPath, pendingActionFrom } from './return-path';
import type { PendingAction } from './return-path';

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

/**
 * Действие, которое гостю сначала предлагает войти (ТЗ 2.6). Клик гостя ведёт на
 * вход и несёт действие в `state` навигации; успешный вход возвращает его сюда,
 * и страница выполняет его один раз, стирая из истории. Адрес страницы действие
 * не запускает, а брошенный вход не оставляет ничего, что сработало бы позже.
 */
export function useAuthAction(intent: string, action: () => void): () => void {
  const me = useMe();
  const location = useLocation();
  const navigate = useNavigate();
  const latest = useRef(action);
  // Запись истории, чьё действие уже выполнено: StrictMode запускает эффект дважды
  const done = useRef<string | null>(null);

  useEffect(() => {
    latest.current = action;
  });

  const signedIn = Boolean(me.data);
  const { pathname, search, hash, key, state } = location;
  useEffect(() => {
    const pending = pendingActionFrom(state);
    if (!signedIn || pending?.path !== pathname || pending.intent !== intent) return;
    if (done.current === key) return;
    done.current = key;
    void navigate(pathname + search + hash, { replace: true, state: null });
    latest.current();
  }, [signedIn, pathname, search, hash, key, state, intent, navigate]);

  return () => {
    if (signedIn) {
      action();
      return;
    }
    const pendingAction: PendingAction = { path: pathname, intent };
    void navigate(loginPath(pathname + search), { state: { pendingAction } });
  };
}
