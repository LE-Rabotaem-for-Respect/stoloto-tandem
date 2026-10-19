# Столото: спорт вместе

Веб-приложение для совместных спортивных активностей: найти событие,
понять условия и записаться, а если подходящего нет — создать своё.

Модульный монолит в одном репозитории (npm workspaces):

| Каталог           | Что внутри                                                           |
| ----------------- | -------------------------------------------------------------------- |
| `apps/api`        | Backend на NestJS                                                    |
| `apps/web`        | Frontend на React + TypeScript + Vite                                |
| `packages/domain` | Общие правила фронтенда и бэкенда, собирается в CommonJS и ES-модуль |
| `e2e`             | Сквозные тесты Playwright                                            |

## Запуск в Docker

Нужны Docker и Docker Compose.

```sh
docker compose up --build
```

- приложение — http://localhost:8080
- API — http://localhost:3000/health (через приложение — http://localhost:8080/api/health)

Порты меняются переменными `WEB_PORT` и `API_PORT`, например
`WEB_PORT=8081 docker compose up --build`.

Другие переменные окружения api:

| Переменная              | По умолчанию в Compose | Что делает                                                                                                       |
| ----------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `DEMO_MODE`             | `true`                 | Быстрый вход, сброс и перемотка демо. На стенде без демо — `false` (в коде по умолчанию `false`)                 |
| `STAND_ID`              | пусто                  | Номер стенда (`stand-1` …): показывается в демо-панели и входит в имя cookie входа                               |
| `SESSION_SECRET`        | пусто                  | Секрет сессий стенда, не короче 32 символов. Пусто — создаётся при первом старте и хранится в томе `api-secrets` |
| `SESSION_COOKIE_SECURE` | `false`                | `true` — cookie входа только по HTTPS (стенд с TLS)                                                              |

## Локальная разработка

Нужен Node.js 24.7 или новее (см. `.nvmrc`): пароли хешируются встроенным `crypto.argon2`.

```sh
npm ci
export SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")
npm run build:domain              # общий пакет нужен api и web в собранном виде
npm run dev -w @tandem/api        # сборка API в режиме наблюдения
npm run start -w @tandem/api      # запуск API на http://localhost:3000
npm run dev -w @tandem/web        # фронтенд на http://localhost:5173, /api проксируется на API
```

API нужна PostgreSQL в `DATABASE_URL`. Её можно поднять отдельно:

```sh
docker run -d --name tandem-pg -p 127.0.0.1:5433:5432 \
  -e POSTGRES_USER=tandem -e POSTGRES_PASSWORD=tandem -e POSTGRES_DB=tandem postgres:17-alpine
export DATABASE_URL=postgresql://tandem:tandem@127.0.0.1:5433/tandem
npm run migrate:deploy -w @tandem/api
```

## База данных

Схема — `apps/api/prisma/schema.prisma`, миграции — `apps/api/prisma/migrations`.
В Docker Compose api применяет миграции сам при каждом старте.

- Изменить схему: правка `schema.prisma`, затем
  `npm run migrate:dev -w @tandem/api -- --name <что изменено>`.
- CHECK-ограничения (ровно один организатор, нормализованная почта, одна строка
  настроек стенда) Prisma не описывает: они в ручной миграции `*_constraints`.
- Частичные уникальные индексы (одна неотменённая запись на пару «событие —
  пользователь») заданы в схеме через `where`.

## Ядро API

Общие части api — в `apps/api/src/core`; модули пользуются только ими.

- **Время — только из `Clock`** (`core/clock`). `Clock.now()` синхронный.
  При `DEMO_MODE=true` к нему прибавляется сдвиг демо-часов из таблицы
  `app_state` своего стенда, вне демо-режима сдвиг не применяется. Сдвиг
  кешируется в памяти процесса и загружается до приёма запросов, поэтому на
  стенд — **один процесс api**. После записи сдвига или сброса демо-данных
  вызовите `clock.refresh()`. Каждый ответ несёт заголовок `X-Server-Time`,
  `GET /clock` отдаёт `{ now, demoMode, standId, lastResetAt }`. ESLint
  запрещает `Date.now()` и `new Date()` без аргументов везде, кроме
  `core/clock` в api и `shared/clock` в web (хук `useClock()`).
- **Ошибки** (`core/errors`) приходят как `{ code, message, fields? }`.
  `code` — из закрытого списка `ERROR_CODES` в `@tandem/domain`, там же
  тексты; HTTP-код задаёт `ERROR_HTTP_STATUS`. В сервисе бросайте
  `new ApiError('event_not_joinable')`; отказы автоматов, ошибки DTO и
  нарушения уникальности фильтр переводит сам. Тексты ошибок полей DTO
  пишутся в декораторах `class-validator` по-русски.
- **Доменные события** (`core/event-bus`): полный перечень —
  `events.ts`. Публикуйте через `eventBus.afterCommit(async (emit) =>
prisma.$transaction(…))`, тогда события уйдут только после коммита.
  Обработчик — метод с `@OnDomainEvent('ParticipationConfirmed')`; он идёт
  асинхронно, его ошибка попадает в журнал и не ломает действие.
- **Права** (`core/policies`): функции по таблице ТЗ 4.4 (`canJoin`,
  `canManageEvent`, `canSeeParticipantInfo`, …) возвращают решение с кодом
  отказа. Сервис по нему бросает ошибку, а `toAction()` превращает его в
  элемент `actions[]` ответа. Пример — `eventActions()` для карточки события.
- **Вход** (`modules/auth`): `POST /auth/register`, `/auth/login`,
  `/auth/demo-login` (только при `DEMO_MODE=true`, ключ из `DEMO_ACCOUNTS`
  в `@tandem/domain`), `/auth/logout`, `GET /me`. Сессия — cookie
  `tandem_session[_<STAND_ID>]`. Глобальный guard кладёт в запрос `actor`;
  в контроллере его берёт `@CurrentActor()`. **Маршрут без метки доступен
  только вошедшим**; открытый всем помечается `@Public()`, доступ ролям —
  `@Roles('user', 'org')` (гостю — 401, чужой роли — 403); метки — из
  `core/access`. Пароли — argon2id; учётки `*@demo` вне демо-режима не входят.
- **Изменяющие запросы** (POST, PUT, PATCH, DELETE) принимаются только со
  страниц своего стенда (`Sec-Fetch-Site` или `Origin`) и с телом в JSON —
  обычная форма с чужого сайта получает 403 или 415 до маршрута.

## Проверки

```sh
npm run lint        # ESLint и Prettier
npm run typecheck   # TypeScript в строгом режиме во всех пакетах
npm test            # unit-тесты Vitest
npm run build       # сборка всех пакетов
```

Тесты ограничений базы идут на настоящей PostgreSQL. Каждый прогон создаёт
на сервере из `TEST_DATABASE_URL` свою временную базу, а после удаляет её.
Существующие базы тесты не трогают.

```sh
TEST_DATABASE_URL=postgresql://tandem:tandem@127.0.0.1:5433/tandem npm run test:db
```

Сквозные тесты идут против запущенного приложения:

```sh
docker compose up --build -d --wait
npx playwright install chromium   # один раз
npm run e2e                       # адрес меняется переменной BASE_URL
```

Те же lint, типы, тесты, тесты базы и запуск compose выполняются в GitHub Actions на каждый
PR в `prod` и push в `prod`.

## Графика

Обложки групп направлений и пиктограммы — собственные, сторонних
наборов нет. Источники и правила использования —
[`apps/web/src/shared/illustrations/SOURCES.md`](apps/web/src/shared/illustrations/SOURCES.md).

Шрифты — сторонние, раздаются вместе с приложением (пакеты
`@fontsource-variable/golos-text` и `@fontsource-variable/unbounded`):

| Шрифт      | Где                             | Лицензия    |
| ---------- | ------------------------------- | ----------- |
| Golos Text | текст интерфейса                | SIL OFL 1.1 |
| Unbounded  | заголовки, число на листке даты | SIL OFL 1.1 |

Тексты лицензий — в пакетах шрифтов и в `docs/design/fonts`.
