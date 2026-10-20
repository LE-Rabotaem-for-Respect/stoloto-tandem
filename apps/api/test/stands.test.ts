import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
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

  it.each(stands)('$name: интервал сброса задан в файле стенда — 10 секунд', ({ env }) => {
    expect(env.DEMO_RESET_INTERVAL_SECONDS).toBe('10');
  });

  it.each(stands)(
    '$name: номер стенда доходит до приложения, демо-режим включён',
    ({ name, env }) => {
      expect(loadStandConfig(env)).toEqual({
        demoMode: true,
        standId: name,
        demoResetIntervalSeconds: 10,
      });
    },
  );

  it('порты не пересекаются между собой и с портами по умолчанию', () => {
    const ports = stands.flatMap(({ env }) => [env.WEB_PORT, env.API_PORT]);
    expect(ports.every((port) => /^\d+$/.test(port ?? ''))).toBe(true);
    expect(new Set(ports).size).toBe(ports.length);
    // 80 на сервере занят системным nginx, 8080 и 3000 — у обычного docker compose up
    expect(ports.filter((port) => ['80', '8080', '3000'].includes(port ?? ''))).toEqual([]);
  });

  it('docker-compose.yml передаёт переменные стенда и не мешает поднять три проекта рядом', () => {
    const compose = readFileSync(resolve(standsDir, '../docker-compose.yml'), 'utf8');
    // Значения из stands/*.env доходят до api и до опубликованных портов
    expect(compose).toContain('STAND_ID: ${STAND_ID:-}');
    expect(compose).toContain('DEMO_MODE: ${DEMO_MODE:-true}');
    expect(compose).toMatch(/\$\{API_PORT:-\d+\}:3000/);
    expect(compose).toMatch(/\$\{WEB_PORT:-\d+\}:80/);
    // Постоянное имя контейнера или образа у собираемых сервисов столкнуло бы проекты
    expect(compose).not.toMatch(/container_name:/);
    expect(compose.match(/^\s+image:/gm)).toHaveLength(1);
  });

  it('стенды поднимаются после перезагрузки сервера, api — только на 127.0.0.1', () => {
    const compose = readFileSync(resolve(standsDir, '../docker-compose.yml'), 'utf8');
    // db, api и web — у каждого политика перезапуска
    expect(compose.match(/^\s+restart: unless-stopped$/gm)).toHaveLength(3);
    expect(compose).toContain("'127.0.0.1:${API_PORT:-3000}:3000'");
  });

  it('web находит api после его пересоздания: адрес — через DNS Docker, не один раз при старте', () => {
    const nginx = readFileSync(resolve(standsDir, '../apps/web/nginx.conf'), 'utf8');
    expect(nginx).toContain('resolver 127.0.0.11 valid=10s ipv6=off;');
    expect(nginx).toContain('set $api api:3000;');
    expect(nginx).toContain('proxy_pass http://$api;');
    expect(nginx).not.toContain('proxy_pass http://api:3000');
    expect(nginx).toContain('server_tokens off;');
    const compose = readFileSync(resolve(standsDir, '../docker-compose.yml'), 'utf8');
    expect(compose).toMatch(/api:\n\s+condition: service_healthy\n(\s+#.*\n)*\s+restart: true/);
  });

  it('журналы контейнеров ограничены по размеру у каждого сервиса', () => {
    const compose = readFileSync(resolve(standsDir, '../docker-compose.yml'), 'utf8');
    expect(compose).toContain('max-size: 10m');
    expect(compose.match(/^\s+logging: \*logging$/gm)).toHaveLength(3);
  });

  it('страницы стенда нельзя встроить в чужой сайт', () => {
    const nginx = readFileSync(resolve(standsDir, '../apps/web/nginx.conf'), 'utf8');
    expect(nginx).toContain(`add_header Content-Security-Policy "frame-ancestors 'none'" always;`);
    expect(nginx).toContain('add_header X-Frame-Options DENY always;');
    expect(nginx).toContain('add_header X-Content-Type-Options nosniff always;');
  });

  it('у каждого стенда своё имя cookie входа: стенды на одном адресе не делят вход', () => {
    const secret = 'test-session-secret-0123456789abcdef';
    const names = stands.map(
      ({ env }) => loadAuthConfig({ ...env, SESSION_SECRET: secret }).cookieName,
    );
    expect(new Set(names).size).toBe(stands.length);
  });
});

// Все переменные, которые подставляет docker-compose.yml, и служебные переменные Compose,
// которые меняют файлы, профили и проект
const composeVariables = [
  ...new Set(
    [
      ...readFileSync(resolve(standsDir, '../docker-compose.yml'), 'utf8').matchAll(
        // ${VAR} и $VAR в любом регистре, кроме экранированного $$
        /(?<!\$)\$\{?([A-Za-z_][A-Za-z0-9_]*)/g,
      ),
    ].map((match) => match[1] ?? ''),
  ),
].sort();
const composeSettings = [
  'COMPOSE_FILE',
  'COMPOSE_PROFILES',
  'COMPOSE_ENV_FILES',
  'COMPOSE_PROJECT_NAME',
];

describe('scripts/stands.sh', () => {
  // Вместо docker — скрипт, который печатает аргументы и всё окружение
  function run(env: Record<string, string>): string {
    const bin = mkdtempSync(join(tmpdir(), 'stands-'));
    try {
      const docker = join(bin, 'docker');
      writeFileSync(docker, ['#!/bin/sh', 'printf "arg %s\\n" "$@"', 'env', ''].join('\n'));
      chmodSync(docker, 0o755);
      return execFileSync('sh', [resolve(standsDir, '../scripts/stands.sh'), 'ps', 'stand-1'], {
        env: { ...process.env, ...env, PATH: `${bin}${delimiter}${process.env.PATH ?? ''}` },
        encoding: 'utf8',
      });
    } finally {
      rmSync(bin, { recursive: true, force: true });
    }
  }

  it('docker-compose.yml читает переменные стенда — список для проверки не пустой', () => {
    expect(composeVariables).toEqual(
      expect.arrayContaining(['DEMO_MODE', 'DEMO_RESET_INTERVAL_SECONDS', 'STAND_ID', 'WEB_BIND']),
    );
  });

  it('ни одна переменная compose из shell не доходит до стенда: значения — из stands/<стенд>.env', () => {
    const fromShell = Object.fromEntries(
      [...composeVariables, ...composeSettings].map((name) => [name, `shell-${name}`]),
    );
    const output = run({ ...fromShell, DEMO_RESET_INTERVAL_SECONDS: '0', DEMO_MODE: 'false' });
    const lines = output.split(/\r?\n/);
    expect(lines).toEqual(
      expect.arrayContaining(['arg --env-file', 'arg stands/stand-1.env', 'arg ps']),
    );
    const leaked = lines
      .map((line) => line.split('=')[0] ?? '')
      .filter((name) => composeVariables.includes(name) || composeSettings.includes(name));
    expect(leaked).toEqual([]);
  });

  it('файл compose задан явно: COMPOSE_FILE и docker-compose.override.yml не действуют', () => {
    const lines = run({ COMPOSE_FILE: 'docker-compose.yml;evil.yml' }).split(/\r?\n/);
    const file = lines.indexOf('arg -f');
    expect(file).toBeGreaterThanOrEqual(0);
    expect(lines[file + 1]).toBe('arg docker-compose.yml');
  });
});
