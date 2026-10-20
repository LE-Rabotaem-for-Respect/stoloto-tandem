import { useEffect, useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useMe } from './api';
import { pendingActionFrom } from './return-path';
import type { PendingAction } from './return-path';

/**
 * Отложенное действие гостя после входа — одно на всё приложение и только в
 * памяти: страница, имя действия и кто вошёл. В истории браузера оно не
 * остаётся, поэтому «Назад», перезагрузка или другой аккаунт его не запустят.
 */
interface Slot extends PendingAction {
  userId: string;
  /** До какого момента (`performance.now()`, реальное время, не демо-часы) действие — ещё ответ на клик гостя. */
  expiresAt: number;
}

// Кнопке хватает этого времени, чтобы появиться после загрузки данных страницы. Позже
// она появляется уже по другой причине — например, запись отменили в другой вкладке
const PENDING_ACTION_TTL_MS = 10_000;

let slot: Slot | null = null;
const listeners = new Set<() => void>();

// Действие — ответ на клик гостя сразу после входа. Если человек начал действовать сам
// (нажал, коснулся, ввёл), оно больше не нужно: иначе кнопка, которая появилась от его
// же действия, например «Записаться» после «Отменить запись», сработала бы без клика
const OWN_ACTIONS = ['pointerdown', 'keydown'] as const;
const discardOnOwnAction = () => setSlot(null);

function setSlot(next: Slot | null) {
  const was = slot;
  slot = next;
  if (next && !was) {
    for (const type of OWN_ACTIONS) document.addEventListener(type, discardOnOwnAction, true);
  } else if (!next && was) {
    for (const type of OWN_ACTIONS) document.removeEventListener(type, discardOnOwnAction, true);
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Слот меняется — хуки на странице проверяют, не их ли это действие. */
export function usePendingSlot(): Slot | null {
  return useSyncExternalStore(subscribe, () => slot);
}

/**
 * Забирает действие, если оно для этой страницы, этого действия и этого человека.
 * Просроченное тоже забирается из слота, но не выполняется.
 */
export function takePendingAction(path: string, intent: string, userId: string): boolean {
  if (slot?.path !== path || slot.intent !== intent || slot.userId !== userId) return false;
  const fresh = performance.now() <= slot.expiresAt;
  setSlot(null);
  return fresh;
}

/**
 * Переносит действие, которое вернул успешный вход, из `state` навигации в
 * память и сразу стирает его из записи истории. Действие живёт, пока человек на
 * этой странице и под этим аккаунтом и пока сам ничего не нажал: ушёл, сменил аккаунт
 * или начал действовать сам — оно выброшено.
 * Монтируется один раз в каркасе, чтобы стирание не зависело от того, есть ли
 * на странице кнопка с этим действием.
 */
export function usePendingActionRelay() {
  const location = useLocation();
  const navigate = useNavigate();
  const me = useMe();
  const userId = me.data?.id ?? null;
  const { pathname, search, hash, key, state } = location;

  useEffect(() => {
    const pending = pendingActionFrom(state);
    // На экранах входа и регистрации действие ещё в пути — его несёт их state
    if (pending && pending.path === pathname) {
      setSlot(
        userId
          ? { ...pending, userId, expiresAt: performance.now() + PENDING_ACTION_TTL_MS }
          : null,
      );
      void navigate(pathname + search + hash, { replace: true, state: null });
      return;
    }
    if (slot && (slot.path !== pathname || slot.userId !== userId)) setSlot(null);
  }, [pathname, search, hash, key, state, userId, navigate]);

  // Каркас размонтирован — оставленное действие никому не принадлежит
  useEffect(() => () => setSlot(null), []);
}
