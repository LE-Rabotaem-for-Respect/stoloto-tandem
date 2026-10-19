interface HeaderResponse {
  setHeader(name: string, value: string): void;
}

/**
 * Ответы api по умолчанию не кешируются: многие зависят от того, кто смотрит
 * (`/me`, карточка мероприятия, своя организация с данными представителя), и не
 * должны оставаться в кеше браузера на общем компьютере. Ставится раньше
 * маршрутов, поэтому действует и на ответы с ошибкой, и на новые маршруты.
 * Маршрут, ответ которого можно кешировать, задаёт свой `@Header('Cache-Control', …)`.
 */
export const noStore = () => (_request: unknown, response: HeaderResponse, next: () => void) => {
  response.setHeader('Cache-Control', 'no-store');
  next();
};
