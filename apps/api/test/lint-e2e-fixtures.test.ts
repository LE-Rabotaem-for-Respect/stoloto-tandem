import { describe, expect, it } from 'vitest';
import { projectEslint } from './lint';

const ruleMessages = projectEslint();
const importErrors = (code: string, file: string) =>
  ruleMessages('no-restricted-imports', code, file);

describe('правило ESLint: тесты e2e — только через фикстуры со сбросом демо-данных', () => {
  it('запрещает test и expect из @playwright/test в e2e/tests', async () => {
    const code = "import { expect, test } from '@playwright/test';\nexport { expect, test };\n";
    expect(await importErrors(code, 'e2e/tests/x.spec.ts')).toBe(1);
  });

  it('разрешает фикстуры, типы Playwright и сами фикстуры', async () => {
    expect(
      await importErrors(
        "import { expect, test } from '../support/fixtures';\nexport { expect, test };\n",
        'e2e/tests/x.spec.ts',
      ),
    ).toBe(0);
    expect(
      await importErrors(
        "import type { Page } from '@playwright/test';\nexport type P = Page;\n",
        'e2e/tests/x.spec.ts',
      ),
    ).toBe(0);
    expect(
      await importErrors(
        "import { test } from '@playwright/test';\nexport { test };\n",
        'e2e/support/fixtures.ts',
      ),
    ).toBe(0);
  });
});
