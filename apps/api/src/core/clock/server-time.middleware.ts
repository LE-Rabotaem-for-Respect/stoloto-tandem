import type { Clock } from './clock';

interface HeaderResponse {
  setHeader(name: string, value: string): void;
}

/**
 * Каждый ответ API несёт время сервера, в том числе ответ с ошибкой.
 * Подключается через `app.use()` раньше разбора тела запроса: иначе ответ
 * на битый или слишком большой JSON ушёл бы без заголовка.
 */
export const serverTime =
  (clock: Clock) => (_request: unknown, response: HeaderResponse, next: () => void) => {
    response.setHeader('X-Server-Time', clock.now().toISOString());
    next();
  };
