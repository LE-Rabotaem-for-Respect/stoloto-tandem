import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/core/errors';
import { PasswordHasher } from '../src/modules/auth/password-hasher';

describe('подставной хеш для входа с незарегистрированной почтой', () => {
  it('отказ при его вычислении не запоминается: следующий вход сверяется как обычно', async () => {
    const hasher = new PasswordHasher();
    const hash = vi
      .spyOn(hasher, 'hash')
      .mockRejectedValueOnce(new ApiError('too_many_requests'))
      .mockResolvedValueOnce(
        '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0$aGFzaGhhc2hoYXNoaGFzaGhhc2g',
      );

    await expect(hasher.verify('пароль', undefined)).rejects.toMatchObject({
      code: 'too_many_requests',
    });
    await expect(hasher.verify('пароль', undefined)).resolves.toBe(false);
    expect(hash).toHaveBeenCalledTimes(2);

    await expect(hasher.verify('пароль', undefined)).resolves.toBe(false);
    expect(hash).toHaveBeenCalledTimes(2);
  });
});
