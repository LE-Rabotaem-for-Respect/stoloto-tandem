import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TIME_ZONE } from '@tandem/domain';

describe('@tandem/domain из apps/web', () => {
  it('подключается как ES-модуль', () => {
    const resolved = fileURLToPath(import.meta.resolve('@tandem/domain'));
    expect(resolved.replaceAll('\\', '/')).toMatch(/packages\/domain\/dist\/index\.mjs$/);
    expect(TIME_ZONE).toBe('Asia/Krasnoyarsk');
  });
});
