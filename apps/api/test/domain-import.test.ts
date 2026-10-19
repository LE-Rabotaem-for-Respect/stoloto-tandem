import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

describe('@tandem/domain из apps/api', () => {
  it('загружается через require из CommonJS-сборки', () => {
    const require = createRequire(__filename);
    const path = require.resolve('@tandem/domain');
    expect(path.replaceAll('\\', '/')).toMatch(/packages\/domain\/dist\/index\.cjs$/);
    expect((require(path) as { TIME_ZONE: string }).TIME_ZONE).toBe('Asia/Krasnoyarsk');
  });
});
