import { isUuid } from '@tandem/domain';
import { isUUID } from 'class-validator';
import { describe, expect, it } from 'vitest';

// Web отбрасывает id из адреса по isUuid, api проверяет его через @IsUUID('all'):
// если правила разойдутся, лента получит 400 вместо отброшенного фильтра
describe('isUuid совпадает с @IsUUID("all")', () => {
  it('на одних и тех же значениях', () => {
    const samples = [
      '3f0c2a8e-5b1d-4c7e-9a20-6d8e1f4b7c31',
      '018f2b6e-7c1a-7d3e-8f00-1a2b3c4d5e6f',
      '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      '00000000-0000-0000-0000-000000000000',
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
      '3f0c2a8e-5b1d-9c7e-9a20-6d8e1f4b7c31',
      '3f0c2a8e-5b1d-4c7e-ca20-6d8e1f4b7c31',
      '3f0c2a8e5b1d4c7e9a206d8e1f4b7c31',
      'curling',
    ];
    for (const value of samples) expect(isUuid(value), value).toBe(isUUID(value, 'all'));
  });
});
