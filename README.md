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

## Локальная разработка

Нужен Node.js 22.12 или новее (рекомендуется 24, см. `.nvmrc`).

```sh
npm ci
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
