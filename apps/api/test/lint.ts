import { ESLint } from 'eslint';
import { resolve } from 'node:path';
import { beforeAll } from 'vitest';

const root = resolve(__dirname, '../../..');

// Первый прогон ESLint холодный: загрузка конфигурации и парсера typescript-eslint
// на машине участника может занять больше стандартных 5 с теста
const WARM_UP_TIMEOUT_MS = 60_000;

/**
 * ESLint с конфигурацией проекта для тестов его правил. Прогревается в `beforeAll`
 * тестового файла, поэтому сами тесты укладываются в обычный таймаут.
 */
export function projectEslint() {
  const eslint = new ESLint({ cwd: root });
  const lint = (code: string, file: string) =>
    eslint.lintText(code, { filePath: resolve(root, file) });

  beforeAll(async () => {
    await lint('export {};\n', 'apps/api/src/warm-up.ts');
  }, WARM_UP_TIMEOUT_MS);

  /** Сколько сообщений правила `ruleId` получит код, будь он файлом `file` проекта. */
  return async function ruleMessages(ruleId: string, code: string, file: string) {
    const [result] = await lint(code, file);
    return (result?.messages ?? []).filter((m) => m.ruleId === ruleId).length;
  };
}
