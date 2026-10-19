import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/core/errors';
import { AttemptLimiter } from '../src/modules/auth/attempt-limiter';
import { ConcurrencyLimit } from '../src/modules/auth/concurrency-limit';

const MINUTE = 60_000;

describe('счётчик попыток', () => {
  function limiter(attempts: number) {
    const clock = { now: 1_000_000 };
    return {
      clock,
      limit: new AttemptLimiter({ attempts, windowMs: 10 * MINUTE }, () => clock.now),
    };
  }

  it('пускает лимит попыток, следующая — 429 с Retry-After и временем по-русски', () => {
    const { clock, limit } = limiter(3);
    for (let i = 0; i < 3; i += 1) limit.hit('1.2.3.4');
    clock.now += 4 * MINUTE;
    const error = (() => {
      try {
        limit.hit('1.2.3.4');
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: 'too_many_requests',
      message: 'Слишком много попыток. Попробуйте через 6 мин',
      retryAfterSeconds: 360,
    });
  });

  it('после окна счётчик сбрасывается', () => {
    const { clock, limit } = limiter(2);
    limit.hit('anna@example.ru');
    limit.hit('anna@example.ru');
    expect(() => limit.hit('anna@example.ru')).toThrow(ApiError);
    clock.now += 10 * MINUTE;
    expect(() => limit.hit('anna@example.ru')).not.toThrow();
  });

  it('ключи считаются отдельно', () => {
    const { limit } = limiter(1);
    limit.hit('a');
    expect(() => limit.hit('b')).not.toThrow();
    expect(() => limit.hit('a')).toThrow(ApiError);
  });
});

describe('память счётчика', () => {
  it('сверх предела ключей забывается самое старое окно, а не новое', () => {
    const clock = { now: 1_000_000 };
    const limit = new AttemptLimiter({ attempts: 1, windowMs: 10 * MINUTE }, () => clock.now, 3);
    for (const key of ['a', 'b', 'c']) {
      limit.hit(key);
      clock.now += 1;
    }
    limit.hit('d');
    expect(() => limit.hit('a')).not.toThrow();
    expect(() => limit.hit('c')).toThrow(ApiError);
    expect(() => limit.hit('d')).toThrow(ApiError);
  });

  it('истёкшие окна забываются и не занимают место живых', () => {
    const clock = { now: 1_000_000 };
    const limit = new AttemptLimiter({ attempts: 1, windowMs: 10 * MINUTE }, () => clock.now, 2);
    limit.hit('a');
    clock.now += 1;
    limit.hit('b');
    clock.now += 10 * MINUTE;
    limit.hit('a');
    clock.now += 1;
    limit.hit('c');
    // «a» и «b» истекли и забыты; новое окно «a» живо, «c» его не вытеснило
    expect(() => limit.hit('a')).toThrow(ApiError);
    expect(() => limit.hit('b')).not.toThrow();
  });
});

describe('ограничение одновременных вычислений', () => {
  function deferred() {
    let release = () => {};
    const done = new Promise<void>((resolve) => {
      release = resolve;
    });
    return { done, release };
  }

  it('одновременно не больше заданного, остальные ждут и выполняются по очереди', async () => {
    const gate = new ConcurrencyLimit(2, 10);
    let running = 0;
    let peak = 0;
    const tasks = Array.from({ length: 5 }, () => deferred());
    const results = tasks.map((task, index) =>
      gate.run(async () => {
        running += 1;
        peak = Math.max(peak, running);
        await task.done;
        running -= 1;
        return index;
      }),
    );
    for (const task of tasks) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      task.release();
    }
    expect(await Promise.all(results)).toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(2);
  });

  it('переполненная очередь — сразу 429', async () => {
    const gate = new ConcurrencyLimit(1, 1);
    const first = deferred();
    const running = gate.run(() => first.done);
    const queued = gate.run(async () => 'ждал');
    await expect(gate.run(async () => 'лишний')).rejects.toMatchObject({
      code: 'too_many_requests',
      message: 'Сервер занят. Попробуйте через несколько секунд',
      retryAfterSeconds: 5,
    });
    first.release();
    await running;
    await expect(queued).resolves.toBe('ждал');
  });
});
