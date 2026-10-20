import { describe, expect, it } from 'vitest';
import { isUuid } from '../src';

describe('isUuid', () => {
  it('принимает id версий 1–8 с вариантом RFC 4122, nil и max', () => {
    for (const id of [
      '3f0c2a8e-5b1d-4c7e-9a20-6d8e1f4b7c31',
      '018f2b6e-7c1a-7d3e-8f00-1a2b3c4d5e6f',
      '3F0C2A8E-5B1D-4C7E-9A20-6D8E1F4B7C31',
      '00000000-0000-0000-0000-000000000000',
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
    ]) {
      expect(isUuid(id), id).toBe(true);
    }
  });

  it('отклоняет hex в форме UUID с чужой версией или вариантом и прочий текст', () => {
    for (const id of [
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
      '3f0c2a8e-5b1d-0c7e-9a20-6d8e1f4b7c31',
      '3f0c2a8e-5b1d-4c7e-1a20-6d8e1f4b7c31',
      '3f0c2a8e-5b1d-4c7e-9a20-6d8e1f4b7c31x',
      'curling',
      '',
    ]) {
      expect(isUuid(id), id).toBe(false);
    }
  });
});
