import 'reflect-metadata';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/core/errors';
import { loadAuthConfig } from '../src/modules/auth/auth-config';
import type { AuthConfig } from '../src/modules/auth/auth-config';
import { AuthGuard } from '../src/modules/auth/auth.guard';
import type { UserWithOrganization } from '../src/modules/auth/auth.repository';
import { readCookie } from '../src/modules/auth/cookies';
import { PASSWORD_HASH_PARAMS, hashPassword, verifyPassword } from '../src/modules/auth/password';
import { ROLES_KEY, toActor } from '../src/modules/auth/roles';
import type { AuthRequest, SignedInRole } from '../src/modules/auth/roles';
import type { SessionService } from '../src/modules/auth/session.service';

const secret = 'a'.repeat(32);

describe('настройки входа', () => {
  it('без секрета сессий, с коротким или заглушкой api не стартует', () => {
    expect(() => loadAuthConfig({})).toThrow(/SESSION_SECRET/);
    expect(() => loadAuthConfig({ SESSION_SECRET: 'short' })).toThrow(/SESSION_SECRET/);
    expect(() => loadAuthConfig({ SESSION_SECRET: '   ' + 'b'.repeat(10) + '   ' })).toThrow();
  });

  it('имя cookie содержит номер стенда: стенды на разных портах не делят вход', () => {
    expect(loadAuthConfig({ SESSION_SECRET: secret }).cookieName).toBe('tandem_session');
    expect(loadAuthConfig({ SESSION_SECRET: secret, STAND_ID: 'stand-2' }).cookieName).toBe(
      'tandem_session_stand-2',
    );
    expect(loadAuthConfig({ SESSION_SECRET: secret, STAND_ID: 'stand 3;x=y' }).cookieName).toBe(
      'tandem_session_stand3xy',
    );
  });
});

describe('пароли', () => {
  it('хранятся как argon2id с параметрами не ниже минимума', async () => {
    const hash = await hashPassword('верный пароль');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$/);
    expect(hash).not.toContain('верный пароль');
    expect(PASSWORD_HASH_PARAMS.memory).toBeGreaterThanOrEqual(19_456);
    expect(PASSWORD_HASH_PARAMS.passes).toBeGreaterThanOrEqual(2);
  });

  it('совпадает только верный пароль; соль у каждого хеша своя', async () => {
    const [first, second] = await Promise.all([hashPassword('demo'), hashPassword('demo')]);
    expect(first).not.toBe(second);
    expect(await verifyPassword('demo', first)).toBe(true);
    expect(await verifyPassword('demo', second)).toBe(true);
    expect(await verifyPassword('Demo', first)).toBe(false);
    expect(await verifyPassword('', first)).toBe(false);
  });

  it('испорченный или чужой формат хеша — не совпадение, а не ошибка', async () => {
    expect(await verifyPassword('demo', 'hash')).toBe(false);
    expect(await verifyPassword('demo', '')).toBe(false);
    expect(await verifyPassword('demo', '$2b$12$abcdefghijklmnopqrstuv')).toBe(false);
  });
});

describe('cookie', () => {
  it('находит нужную cookie среди нескольких', () => {
    expect(readCookie('a=1; tandem_session=abc%2Fdef; b=2', 'tandem_session')).toBe('abc/def');
    expect(readCookie('tandem_session_stand-1=x', 'tandem_session')).toBeUndefined();
    expect(readCookie(undefined, 'tandem_session')).toBeUndefined();
    expect(readCookie('tandem_session=%E0%A4%A', 'tandem_session')).toBeUndefined();
  });
});

const config: AuthConfig = { sessionSecret: secret, cookieName: 'sid', sessionTtlMs: 1000 };

function user(role: 'user' | 'org' | 'admin'): UserWithOrganization {
  return {
    id: 'u1',
    role,
    name: 'Анна',
    email: 'anna@example.ru',
    passwordHash: 'hash',
    city: null,
    bio: null,
    settings: {},
    createdAt: new Date(0),
    organization: role === 'org' ? { id: 'o1', name: 'Клуб', status: 'draft' } : null,
  };
}

function guardFor(sessionUser: UserWithOrganization | null, roles?: SignedInRole[]) {
  const reflector = new Reflector();
  const handler = () => undefined;
  if (roles) Reflect.defineMetadata(ROLES_KEY, roles, handler);
  const sessions = { resolve: async () => sessionUser } as unknown as SessionService;
  const request: AuthRequest = { headers: { cookie: sessionUser ? 'sid=token' : undefined } };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => class {},
  } as unknown as ExecutionContext;
  return { run: () => new AuthGuard(reflector, sessions, config).canActivate(context), request };
}

describe('проверка ролей', () => {
  it('маршрут без ролей открыт гостю, в запросе — гость', async () => {
    const { run, request } = guardFor(null);
    await expect(run()).resolves.toBe(true);
    expect(request.actor).toEqual({ role: 'guest' });
  });

  it('гостю закрытый маршрут — 401, чужой роли — 403', async () => {
    const guest = guardFor(null, ['user']);
    await expect(guest.run()).rejects.toMatchObject({ code: 'unauthorized' });
    const wrongRole = guardFor(user('user'), ['admin']);
    const error = await wrongRole.run().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'forbidden' });
  });

  it('нужная роль проходит; роль и организация — из базы', async () => {
    const { run, request } = guardFor(user('org'), ['org']);
    await expect(run()).resolves.toBe(true);
    expect(request.actor).toEqual({
      role: 'org',
      userId: 'u1',
      organization: { id: 'o1', status: 'draft' },
    });
    expect(request.sessionToken).toBe('token');
  });

  it('аккаунт организации без организации — ошибка, а не тихий вход', () => {
    expect(() => toActor({ ...user('org'), organization: null })).toThrow();
  });
});
