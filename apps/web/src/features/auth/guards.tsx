import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useMe } from './api';
import { issuePendingAction, takePendingAction, usePendingSlot } from './pending-action';
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

/** Сколько смонтированных кнопок с каждым `intent` — для проверки уникальности. */
const mountedIntents = new Map<string, number>();

function useUniqueIntent(intent: string) {
  useEffect(() => {
    const count = (mountedIntents.get(intent) ?? 0) + 1;
    mountedIntents.set(intent, count);
    if (count > 1 && import.meta.env.DEV) {
      console.error(
        `useAuthAction: intent «${intent}» уже есть на странице — сделайте его уникальным, например join:<id>`,
      );
    }
    return () => {
      const left = (mountedIntents.get(intent) ?? 1) - 1;
      if (left > 0) mountedIntents.set(intent, left);
      else mountedIntents.delete(intent);
    };
  }, [intent]);
}

/**
 * Действие, которое гостю сначала предлагает войти (ТЗ 2.6). Клик гостя ведёт на
 * вход и несёт действие в `state` навигации; успешный вход возвращает его сюда,
 * каркас переносит его в память (`usePendingActionRelay`) и стирает из истории,
 * а хук выполняет его один раз — для того, кто вошёл, и пока он на этой странице.
 * Адрес страницы, «Назад» и другой аккаунт действие не запускают.
 *
 * `intent` уникален на странице: у кнопок разных событий — `join:<id>`,
 * `apply:<id>`. С одинаковым действие после входа заберёт первая смонтированная
 * кнопка — возможно, не та, которую нажал гость.
 */
export function useAuthAction(intent: string, action: () => void): () => void {
  useUniqueIntent(intent);
  const me = useMe();
  const location = useLocation();
  const navigate = useNavigate();
  const latest = useRef(action);
  const slot = usePendingSlot();

  useEffect(() => {
    latest.current = action;
  });

  const userId = me.data?.id ?? null;
  const { pathname, search } = location;
  useEffect(() => {
    // Забирает слот один из хуков: две кнопки одного действия не выполнят его дважды
    if (userId && takePendingAction(pathname, intent, userId)) latest.current();
  }, [slot, userId, pathname, intent]);

  return () => {
    if (userId) {
      action();
      return;
    }
    const pendingAction = issuePendingAction(pathname, intent);
    void navigate(loginPath(pathname + search), { state: { pendingAction } });
  };
}
