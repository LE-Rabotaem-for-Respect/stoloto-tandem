import { ESLint } from 'eslint';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../..');
const eslint = new ESLint({ cwd: root });

async function importErrors(code: string, file: string) {
  const [result] = await eslint.lintText(code, { filePath: resolve(root, file) });
  return (result?.messages ?? []).filter((m) => m.ruleId === 'no-restricted-imports').length;
}

const onEvent = "import { OnEvent } from '@nestjs/event-emitter';\nexport { OnEvent };\n";

describe('правило ESLint о подписке на события', () => {
  it('запрещает обычный OnEvent в модулях api', async () => {
    expect(await importErrors(onEvent, 'apps/api/src/modules/notifications/x.ts')).toBe(1);
  });

  it('запрещает глубокий импорт из библиотеки в обход правила', async () => {
    const deep =
      "import { OnEvent } from '@nestjs/event-emitter/dist/decorators/on-event.decorator';\nexport { OnEvent };\n";
    expect(await importErrors(deep, 'apps/api/src/modules/notifications/x.ts')).toBe(1);
  });

  it('разрешает его в core/event-bus и другие импорты из библиотеки', async () => {
    expect(await importErrors(onEvent, 'apps/api/src/core/event-bus/event-bus.ts')).toBe(0);
    expect(
      await importErrors(
        "import { EventEmitter2 } from '@nestjs/event-emitter';\nexport { EventEmitter2 };\n",
        'apps/api/src/modules/notifications/x.ts',
      ),
    ).toBe(0);
  });
});
