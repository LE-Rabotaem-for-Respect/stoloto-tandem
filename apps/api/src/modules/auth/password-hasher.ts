import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConcurrencyLimit } from './concurrency-limit';
import { hashPassword, verifyPassword } from './password';

/**
 * argon2id через очередь: поток входов не съедает процессор всех стендов
 * сервера. Лишние запросы ждут своей очереди, переполненная очередь — 429.
 */
@Injectable()
export class PasswordHasher {
  // На сервере 2 CPU: не больше двух вычислений на стенд; сверх 32 ждущих — 429
  private readonly gate = new ConcurrencyLimit(2, 32);
  // Хеш для сверки, когда почты нет: ответ «неверная почта» не должен приходить быстрее «неверного пароля»
  private decoyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return this.limited(() => hashPassword(password));
  }

  /** Сверяет пароль с хешем; без хеша (почты нет) сверяет с подставным. */
  async verify(password: string, stored: string | undefined): Promise<boolean> {
    const hash = stored ?? (await this.decoy());
    const matches = await this.limited(() => verifyPassword(password, hash));
    return stored !== undefined && matches;
  }

  // Неудачная попытка (например, 429 от полной очереди) не запоминается: иначе вход с
  // незарегистрированной почтой отвечал бы 429 до перезапуска и выдавал, какие почты есть
  private decoy(): Promise<string> {
    this.decoyHash ??= this.hash(randomBytes(16).toString('hex')).catch((error: unknown) => {
      this.decoyHash = undefined;
      throw error;
    });
    return this.decoyHash;
  }

  private limited<T>(work: () => Promise<T>): Promise<T> {
    return this.gate.run(work);
  }
}
