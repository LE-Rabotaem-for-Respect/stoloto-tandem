import { afterAll, describe, expect, it } from 'vitest';
import { toErrorBody } from '../src/core/errors';
import { createUser, prisma } from './db';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('нарушение уникальности на настоящей базе', () => {
  it('занятая почта приходит как conflict с полем email', async () => {
    const user = await createUser();
    const error = await prisma.user
      .create({
        data: { name: 'Дубль', email: user.email, passwordHash: 'hash', createdAt: user.createdAt },
      })
      .catch((e: unknown) => e);
    expect(toErrorBody(error)).toEqual({
      code: 'conflict',
      message: 'Такая запись уже есть',
      fields: { email: 'Эта почта уже зарегистрирована' },
    });
  });
});
