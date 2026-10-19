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
    files: ['apps/web/src/**', 'packages/domain/src/**'],
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
    // NestJS внедряет зависимости по типам параметров конструктора и требует классы-модули
    files: ['apps/api/**/*.ts'],
    rules: { '@typescript-eslint/no-extraneous-class': 'off' },
  },
  prettier,
);
