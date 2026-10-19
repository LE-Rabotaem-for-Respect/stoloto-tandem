import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// «Сейчас» берётся только из Clock: в демо-режиме время перематывается
const currentTime = [
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message: 'Текущее время — только из Clock (api) или useClock() (web).',
  },
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: 'Текущее время — только из Clock (api) или useClock() (web).',
  },
];

// Частичные уникальные индексы Prisma выдаёт за уникальный ключ, хотя строк по нему
// может быть несколько: update и delete по такому ключу изменят их все
const partialUniqueKeys = [
  {
    selector:
      'Property[key.name=/^(eventId_userId|userId_accessoryId)$/], Property[key.value=/^(eventId_userId|userId_accessoryId)$/]',
    message:
      'Ключ частичного индекса не уникален: ищите запись по id или через findFirst с фильтром по статусу.',
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      'apps/api/src/generated/**',
      'e2e/test-results/**',
      'e2e/playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // В web «сейчас» считает только хук useClock() в shared/clock: время сервера плюс разница часов
    files: ['apps/web/src/**', 'packages/domain/src/**'],
    ignores: ['apps/web/src/shared/clock/**'],
    rules: { 'no-restricted-syntax': ['error', ...currentTime] },
  },
  {
    files: ['apps/api/src/**'],
    ignores: ['apps/api/src/core/clock/**'],
    rules: { 'no-restricted-syntax': ['error', ...currentTime, ...partialUniqueKeys] },
  },
  {
    files: ['apps/api/src/core/clock/**', 'apps/api/test/**', 'apps/api/test-db/**'],
    rules: { 'no-restricted-syntax': ['error', ...partialUniqueKeys] },
  },
  {
    // Обычный @OnEvent по умолчанию сам пишет в журнал текст ошибки обработчика целиком
    files: ['apps/api/src/**'],
    ignores: ['apps/api/src/core/event-bus/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@nestjs/event-emitter',
              importNames: ['OnEvent'],
              message:
                'Подписка на события — через OnDomainEvent из core/event-bus: он пишет ошибки обработчика без данных вызова.',
            },
          ],
          patterns: [
            {
              group: ['@nestjs/event-emitter/*'],
              message:
                'Внутренние модули @nestjs/event-emitter не импортируются: подписка — через OnDomainEvent.',
            },
          ],
        },
      ],
    },
  },
  {
    // Тесты e2e берут test и expect из фикстур: перед каждым тестом сбрасываются демо-данные
    files: ['e2e/tests/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@playwright/test',
              allowTypeImports: true,
              message:
                'Тест e2e берёт test и expect из ../support/fixtures: там перед каждым тестом сброс демо-данных.',
            },
          ],
        },
      ],
    },
  },
  {
    // NestJS внедряет зависимости по типам параметров конструктора и требует классы-модули
    files: ['apps/api/**/*.ts'],
    rules: { '@typescript-eslint/no-extraneous-class': 'off' },
  },
  prettier,
);
