import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Параметры argon2id (DECISION-003): не ниже минимума OWASP — 19 МиБ памяти,
 * 2 прохода. Хранятся в самой строке хеша, поэтому их можно поднять позже,
 * не ломая уже сохранённые пароли.
 */
export const PASSWORD_HASH_PARAMS = { memory: 19_456, passes: 2, parallelism: 1, tagLength: 32 };

interface HashParams {
  memory: number;
  passes: number;
  parallelism: number;
  tagLength: number;
}

const b64 = (buffer: Buffer) => buffer.toString('base64').replace(/=+$/, '');

function derive(password: string, nonce: Buffer, params: HashParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2('argon2id', { message: password, nonce, ...params }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/** Хеш пароля в формате PHC: `$argon2id$v=19$m=…,t=…,p=…$соль$хеш`. */
export async function hashPassword(password: string): Promise<string> {
  const nonce = randomBytes(16);
  const params = PASSWORD_HASH_PARAMS;
  const key = await derive(password, nonce, params);
  return `$argon2id$v=19$m=${params.memory},t=${params.passes},p=${params.parallelism}$${b64(nonce)}$${b64(key)}`;
}

const PHC = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

/** Сверяет пароль с хешем; испорченный или чужой формат — просто «не совпало». */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [, memory, passes, parallelism, nonce, hash] = PHC.exec(stored) ?? [];
  if (!nonce || !hash) return false;
  // Хеш слабее минимума (подложенный в базу или устаревший) не принимается
  if (
    Number(memory) < PASSWORD_HASH_PARAMS.memory ||
    Number(passes) < PASSWORD_HASH_PARAMS.passes
  ) {
    return false;
  }
  const expected = Buffer.from(hash, 'base64');
  const key = await derive(password, Buffer.from(nonce, 'base64'), {
    memory: Number(memory),
    passes: Number(passes),
    parallelism: Number(parallelism),
    tagLength: expected.length,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}
