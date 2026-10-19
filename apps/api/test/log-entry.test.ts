import { TransitionError, participationMachine } from '@tandem/domain';
import { describe, expect, it } from 'vitest';
import { ApiError, logEntry } from '../src/core/errors';
import { Prisma } from '../src/generated/prisma/client';

const email = 'anna@demo';

function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('ожидалась ошибка');
}

describe('logEntry: запись об ошибке для журнала по белому списку', () => {
  it('JSON.parse с почтой — имя и кадры стека, без входных данных', () => {
    const error = thrown(() => JSON.parse(email));
    const entry = logEntry(error);
    expect(entry).toMatch(/^SyntaxError\n\s+at /);
    expect(entry).not.toContain(email);
  });

  it('обычная ошибка с почтой в тексте — без текста', () => {
    const entry = logEntry(new Error(`Не удалось отправить письмо на ${email}`));
    expect(entry.split('\n')[0]).toBe('Error');
    expect(entry).not.toContain(email);
  });

  it('брошенная строка и другие значения — только их тип', () => {
    expect(logEntry(`письмо для ${email}`)).toBe('Брошено не Error, а string');
    expect(logEntry({ email })).toBe('Брошено не Error, а object');
    expect(logEntry(null)).toBe('Брошено не Error, а null');
    expect(logEntry(undefined)).toBe('Брошено не Error, а undefined');
  });

  it('не бросает на значениях без прототипа и с ломающимися полями', () => {
    expect(logEntry(Object.create(null))).toBe('Брошено не Error, а object');
    const broken = new Error('секрет');
    Object.defineProperty(broken, 'stack', {
      get() {
        throw new Error('stack недоступен');
      },
    });
    expect(logEntry(broken)).toBe('Ошибка, которую не удалось описать');
  });

  it('ошибка Prisma — имя и код, без аргументов вызова', () => {
    const error = new Prisma.PrismaClientKnownRequestError(`Unique constraint: ${email}`, {
      code: 'P2002',
      clientVersion: 'test',
    });
    const entry = logEntry(error);
    expect(entry.split('\n')[0]).toBe('PrismaClientKnownRequestError P2002');
    expect(entry).not.toContain(email);
  });

  it('код и имя с посторонними символами в журнал не идут', () => {
    const error = Object.assign(new Error('x'), { code: email });
    error.name = `Ошибка ${email}`;
    const entry = logEntry(error);
    expect(entry.split('\n')[0]).toBe('Error');
    expect(entry).not.toContain(email);
  });

  it('свои ошибки — с текстом: он из словаря', () => {
    expect(logEntry(new ApiError('event_not_joinable')).split('\n')[0]).toBe(
      'ApiError event_not_joinable: Мероприятие недоступно для записи',
    );
    const transition = thrown(() =>
      participationMachine.nextState('rejected', 'join', { mode: 'free', hasSeats: true }),
    );
    expect(transition).toBeInstanceOf(TransitionError);
    expect(logEntry(transition).split('\n')[0]).toBe(
      `TransitionError rejected_final: ${(transition as TransitionError).message}`,
    );
  });

  describe('строки сообщения не проходят под видом кадров стека', () => {
    const newline = String.fromCharCode(10);
    const fakeFrame = `${newline}    at встреча, ${email}`;

    it('многострочное сообщение с «    at <почта>»', () => {
      const entry = logEntry(new Error(`Не отправлено: Привет${fakeFrame}`));
      expect(entry).not.toContain(email);
      expect(entry).toMatch(/^Error\n\s+at /);
    });

    it('JSON.parse на таком входе', () => {
      // Вход короткий: длинный V8 обрезает в тексте ошибки
      const entry = logEntry(thrown(() => JSON.parse(`x${newline}    at ${email}`)));
      expect(entry).not.toContain(email);
      expect(entry).toMatch(/^SyntaxError\n\s+at /);
    });

    it('сообщение изменили после создания — остаются только кадры строгого формата', () => {
      const error = new Error(`Привет${fakeFrame}`);
      // V8 собирает stack при первом обращении: обращаемся до смены сообщения
      expect(error.stack).toContain(email);
      error.message = 'другое';
      const entry = logEntry(error);
      expect(entry).not.toContain(email);
      expect(entry.split(newline).slice(1)).not.toHaveLength(0);
    });

    it('сообщение укоротили до первой строки после чтения stack', () => {
      const error = new Error(`Привет${fakeFrame}`);
      expect(error.stack).toContain(email);
      error.message = error.message.split(newline)[0] ?? '';
      expect(logEntry(error)).not.toContain(email);
    });

    it('сообщение очистили после чтения stack', () => {
      const error = new Error(`Привет${fakeFrame}`);
      expect(error.stack).toContain(email);
      error.message = '';
      const entry = logEntry(error);
      expect(entry).not.toContain(email);
      expect(entry.split(newline).slice(1)).not.toHaveLength(0);
    });

    it('сообщение совпадает с именем ошибки', () => {
      const error = new Error('Error');
      error.stack = `Error: Error${fakeFrame}`;
      expect(logEntry(error)).not.toContain(email);
    });

    it('к стеку приклеен стек причины (Caused by) — его строки не идут', () => {
      const cause = new Error(`Причина${fakeFrame}`);
      const error = new Error('Не удалось');
      error.stack += `${newline}Caused by: ${cause.stack ?? ''}`;
      const entry = logEntry(error);
      expect(entry).not.toContain(email);
      expect(entry).not.toContain('Caused by');
      expect(entry.split(newline).slice(1)).not.toHaveLength(0);
    });

    it('stack подменён, а сообщение совпадает с его заголовком', () => {
      const error = new Error('ok');
      error.stack = `Error: ok${newline}    at ${email}`;
      expect(logEntry(error)).toBe('Error');
    });

    it('нестроковое сообщение', () => {
      for (const message of [5, {}]) {
        const error = new Error('x');
        error.stack = `Error: ${String(message)}${fakeFrame}`;
        Object.defineProperty(error, 'message', { value: message });
        expect(logEntry(error)).not.toContain(email);
      }
    });

    it.each([
      ['имя функции с пробелом', '    at Anna Ivanova (/x.js:1:1)', 'Anna'],
      ['путь с @', `    at /home/${email}:1:1`, email],
      ['путь с @ в скобках', `    at run (/home/${email}/x.js:1:1)`, email],
    ])('кадр-подделка: %s', (_, line, secret) => {
      for (const stack of [`Error: ok${newline}${line}`, `Error: другое${newline}${line}`]) {
        const error = new Error('ok');
        error.stack = stack;
        expect(logEntry(error), stack).not.toContain(secret);
      }
    });
  });

  describe('настоящие кадры V8 проходят', () => {
    const newline = String.fromCharCode(10);

    it.each([
      '    at g (/app/dist/x.js:6:39)',
      '    at /app/dist/x.js:6:39',
      '    at async Promise.all (index 0)',
      '    at new ApiError (file:///app/dist/x.mjs:1:1)',
      '    at Object.<anonymous> (C:\\work\\x.js:1:1)',
      '    at Foo.bar [as baz] (node:internal/modules/cjs/loader:1554:14)',
      '    at async process.processTicksAndRejections (node:internal/process/task_queues:105:5)',
    ])('%s', (frame) => {
      const error = new Error('ok');
      error.stack = `Error: ok${newline}${frame}${newline}    at last (/app/x.js:1:1)`;
      const entry = logEntry(error).split(newline);
      // Кадр без пути не пишется, но и не обрывает блок: следующий кадр на месте
      expect(entry).toContain('    at last (/app/x.js:1:1)');
      if (frame !== '    at async Promise.all (index 0)') expect(entry).toContain(frame);
    });
  });
});
