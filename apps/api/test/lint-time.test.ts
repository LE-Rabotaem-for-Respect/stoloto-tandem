import { describe, expect, it } from 'vitest';
import { projectEslint } from './lint';

const ruleMessages = projectEslint();
const timeErrors = (code: string, file: string) => ruleMessages('no-restricted-syntax', code, file);

describe('правило ESLint о текущем времени', () => {
  it.each(['apps/api/src/x.ts', 'apps/web/src/x.ts', 'packages/domain/src/x.ts'])(
    'запрещает Date.now() и new Date() без аргументов в %s',
    async (file) => {
      expect(
        await timeErrors('export const a = Date.now();\nexport const b = new Date();\n', file),
      ).toBe(2);
    },
  );

  it('разрешает дату из аргумента и реализацию Clock', async () => {
    expect(
      await timeErrors("export const a = new Date('2026-10-19T00:00:00Z');\n", 'apps/api/src/x.ts'),
    ).toBe(0);
    expect(
      await timeErrors('export const a = new Date();\n', 'apps/api/src/core/clock/clock.ts'),
    ).toBe(0);
  });

  it('в web исключение — только хук useClock() в shared/clock', async () => {
    const code = 'export const a = Date.now();\n';
    expect(await timeErrors(code, 'apps/web/src/shared/clock/use-clock.ts')).toBe(0);
    expect(await timeErrors(code, 'apps/web/src/shared/ui/x.ts')).toBe(1);
  });
});
