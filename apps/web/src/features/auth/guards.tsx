import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useMe } from './api';
import { loginPath, withParam } from './return-path';

/** Раздел только для вошедших: гостя отправляет на вход и возвращает сюда же. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <p role="status">Загрузка…</p>;
  if (!me.data) return <Navigate to={loginPath(location.pathname + location.search)} replace />;
  return children;
}

const INTENT = 'intent';

/**
 * Действие, которое гостю сначала предлагает войти (ТЗ 2.6). Гость уходит на
 * вход с адресом возврата `?intent=<имя>`; вернувшись уже вошедшим, страница
 * выполняет то же действие сама — человеку не нужно искать кнопку заново.
 */
export function useAuthAction(intent: string, action: () => void): () => void {
  const me = useMe();
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const latest = useRef(action);

  useEffect(() => {
    latest.current = action;
  });

  const signedIn = Boolean(me.data);
  const pending = params.get(INTENT) === intent;
  useEffect(() => {
    if (!signedIn || !pending) return;
    setParams(
      (current) => {
        current.delete(INTENT);
        return current;
      },
      { replace: true },
    );
    latest.current();
  }, [signedIn, pending, setParams]);

  return () => {
    if (signedIn) {
      action();
      return;
    }
    void navigate(loginPath(withParam(location.pathname, location.search, INTENT, intent)));
  };
}
