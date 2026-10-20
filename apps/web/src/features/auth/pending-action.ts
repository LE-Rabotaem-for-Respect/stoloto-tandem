import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useMe } from './api';
import { isAuthPage, pendingActionFrom } from './return-path';
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
// (click — для экранного диктора и голосового управления: они нажимают без указателя)
const OWN_ACTIONS = ['pointerdown', 'keydown', 'click'] as const;
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

/**
 * Номер последнего действия, выданного кликом гостя в этой вкладке. Действие из
 * `state` навигации принимается, только если несёт этот номер, и один раз: старые
 * записи истории — вход, брошенный раньше, «Назад» после смены аккаунта — его не
 * запустят. Номер сбрасывается, когда гость ушёл с экранов входа и регистрации, не войдя,
 * и при смене пользователя вне того входа, что его несёт.
 */
let issuedToken: string | null = null;
let nextToken = 1;

// История вкладки переживает перезагрузку и копируется в дублированную вкладку, а
// счётчик — нет. Случайная часть не даёт номеру новой загрузки совпасть со старой
// записью входа (getRandomValues, в отличие от randomUUID, есть и на стенде по http)
const documentId = Array.from(crypto.getRandomValues(new Uint32Array(2)), (part) =>
  part.toString(36),
).join('');

export function issuePendingAction(path: string, intent: string): PendingAction {
  issuedToken = `${documentId}:${nextToken}`;
  nextToken += 1;
  return { path, intent, token: issuedToken };
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
  const previousUserId = useRef(userId);

  useEffect(() => {
    const pending = pendingActionFrom(state);
    const carried = pending !== null && pending.token === issuedToken;
    // Вошёл или вышел кто-то не тем входом, что несёт выданное действие, или гость ушёл
    // со входа, не войдя, — оно не нужно: иначе к брошенному входу вернулись бы «Назад»
    if (!carried && (previousUserId.current !== userId || !isAuthPage(pathname))) {
      issuedToken = null;
    }
    previousUserId.current = userId;
    // На экранах входа и регистрации действие ещё в пути — его несёт их state
    if (pending && pending.path === pathname) {
      const fresh = userId !== null && carried;
      if (fresh) issuedToken = null;
      setSlot(
        fresh ? { ...pending, userId, expiresAt: performance.now() + PENDING_ACTION_TTL_MS } : null,
      );
      void navigate(pathname + search + hash, { replace: true, state: null });
      return;
    }
    if (slot && (slot.path !== pathname || slot.userId !== userId)) setSlot(null);
  }, [pathname, search, hash, key, state, userId, navigate]);

  // Каркас размонтирован или страница ушла с сайта — оставленное действие никому не
  // принадлежит. pagehide: после ухода на другой адрес «Назад» достаёт страницу из bfcache
  // вместе с памятью, и брошенный вход сработал бы для того, кто войдёт следующим
  useEffect(() => {
    const discard = () => {
      issuedToken = null;
      setSlot(null);
    };
    window.addEventListener('pagehide', discard);
    return () => {
      window.removeEventListener('pagehide', discard);
      discard();
    };
  }, []);
}
