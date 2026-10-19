import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type { TestProject } from 'vitest/node';
import { createPrismaClient } from '../src/core/prisma/prisma.service';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/**
 * Создаёт для прогона отдельную базу на сервере из TEST_DATABASE_URL, применяет к ней
 * миграции и удаляет её в конце. Существующие базы сервера тесты не трогают.
 */
export default async function setup(project: TestProject) {
  const serverUrl = process.env.TEST_DATABASE_URL;
  if (!serverUrl) {
    throw new Error(
      'Не задана TEST_DATABASE_URL — адрес PostgreSQL, на котором тесты создадут временную базу. ' +
        'Например: postgresql://tandem:tandem@127.0.0.1:5432/tandem',
    );
  }

  const name = `tandem_test_${randomBytes(6).toString('hex')}`;
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  const databaseUrl = url.toString();

  const admin = createPrismaClient(serverUrl);
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  const teardown = async () => {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.$disconnect();
  };

  try {
    execSync('npx prisma migrate deploy', {
      cwd: resolve(__dirname, '..'),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });
  } catch (error) {
    await teardown();
    throw error;
  }
  project.provide('databaseUrl', databaseUrl);

  return teardown;
}
