import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadStandConfig } from '../src/core/config';
import { loadAuthConfig } from '../src/modules/auth/auth-config';

const standsDir = resolve(__dirname, '../../../stands');

// Переменные стенда — так их читает docker compose --env-file: КЛЮЧ=значение, # — комментарий
function readEnv(file: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync(resolve(standsDir, file), 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (match?.[1] && match[2] !== undefined) env[match[1]] = match[2];
  }
  return env;
}

const stands = readdirSync(standsDir)
  .filter((file) => file.endsWith('.env'))
  .sort()
  .map((file) => ({ name: file.replace(/\.env$/, ''), env: readEnv(file) }));

describe('стенды stand-1…3 (stands/*.env)', () => {
  it('три стенда', () => {
    expect(stands.map((stand) => stand.name)).toEqual(['stand-1', 'stand-2', 'stand-3']);
  });

  it.each(stands)(
    '$name: номер стенда доходит до приложения, демо-режим включён',
    ({ name, env }) => {
      expect(loadStandConfig(env)).toEqual({ demoMode: true, standId: name });
    },
  );

  it('порты не пересекаются между собой и с портами по умолчанию', () => {
    const ports = stands.flatMap(({ env }) => [env.WEB_PORT, env.API_PORT]);
    expect(ports.every((port) => /^\d+$/.test(port ?? ''))).toBe(true);
    expect(new Set(ports).size).toBe(ports.length);
    // 80 на сервере занят системным nginx, 8080 и 3000 — у обычного docker compose up
    expect(ports.filter((port) => ['80', '8080', '3000'].includes(port ?? ''))).toEqual([]);
  });

  it('у каждого стенда своё имя cookie входа: стенды на одном адресе не делят вход', () => {
    const secret = 'test-session-secret-0123456789abcdef';
    const names = stands.map(
      ({ env }) => loadAuthConfig({ ...env, SESSION_SECRET: secret }).cookieName,
    );
    expect(new Set(names).size).toBe(stands.length);
  });
});
