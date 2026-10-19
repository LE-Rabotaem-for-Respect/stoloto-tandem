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

## Проверки

```sh
npm run lint        # ESLint и Prettier
npm run typecheck   # TypeScript в строгом режиме во всех пакетах
npm test            # unit-тесты Vitest
npm run build       # сборка всех пакетов
```

Сквозные тесты идут против запущенного приложения:

```sh
docker compose up --build -d --wait
npx playwright install chromium   # один раз
npm run e2e                       # адрес меняется переменной BASE_URL
```

Те же lint, типы, тесты и сборка выполняются в GitHub Actions на каждый
PR в `prod` и push в `prod`.

## Графика

Обложки групп направлений и пиктограммы — собственные, сторонних
наборов нет. Источники и правила использования —
[`apps/web/src/shared/illustrations/SOURCES.md`](apps/web/src/shared/illustrations/SOURCES.md).
