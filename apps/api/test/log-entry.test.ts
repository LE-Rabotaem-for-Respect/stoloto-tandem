import { readFileSync } from 'node:fs';
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

  it('ошибка Node с кодом в заголовке stack — имя, код и кадры', () => {
    // Настоящая ошибка Node; под vitest её stack пересобран без кода, поэтому заголовок
    // ставим таким, каким его пишет сам Node: «TypeError [ERR_INVALID_ARG_TYPE]: …»
    const error = thrown(() => readFileSync(undefined as never)) as Error & { code: string };
    expect(error.code).toBe('ERR_INVALID_ARG_TYPE');
    const frames = '    at Object.openSync (node:fs:622:5)\n    at run (/app/x.js:1:1)';
    error.stack = `TypeError [ERR_INVALID_ARG_TYPE]: ${error.message}\n${frames}`;
    const entry = logEntry(error);
    expect(entry).toBe(`TypeError ERR_INVALID_ARG_TYPE\n${frames}`);
    expect(entry).not.toContain('Received');
  });

  it('заголовок «Имя [КОД]» при пустом сообщении — кадры на месте', () => {
    const error = Object.assign(new Error(''), { code: 'ERR_X' });
    error.stack = `Error [ERR_X]${String.fromCharCode(10)}    at run (/app/x.js:1:1)`;
    expect(logEntry(error)).toBe(`Error ERR_X${String.fromCharCode(10)}    at run (/app/x.js:1:1)`);
  });

  it.each([
    ['код ошибки — лишь начало кода в скобках', 'ERR', 'Error [ERR_X]'],
    ['недопустимое имя перед скобками', 'ERR_X', 'Ошибка 1 [ERR_X]'],
  ])('заголовок не принят: %s', (_, code, header) => {
    const error = Object.assign(new Error('ok'), { code });
    error.stack = `${header}: ok${String.fromCharCode(10)}    at run (/app/x.js:1:1)`;
    expect(logEntry(error)).toMatch(/\(кадры стека не записаны\)$/);
  });

  it('код в заголовке stack не совпал с кодом ошибки — кадры не пишутся', () => {
    for (const code of [undefined, 'ERR_OTHER', `${email}`]) {
      const error = Object.assign(new Error('ok'), { code });
      error.stack = `Error [ERR_X]: ok${String.fromCharCode(10)}    at run (/app/x.js:1:1)`;
      expect(logEntry(error)).toMatch(/\(кадры стека не записаны\)$/);
    }
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

    // Заголовок stack не совпал с сообщением: где кончается текст, уже не узнать
    const skipped = `Error${newline}(кадры стека не записаны)`;

    it('сообщение изменили после создания — кадры не пишутся, вместо них пометка', () => {
      const error = new Error(`Привет${fakeFrame}`);
      // V8 собирает stack при первом обращении: обращаемся до смены сообщения
      expect(error.stack).toContain(email);
      error.message = 'другое';
      expect(logEntry(error)).toBe(skipped);
    });

    it('сообщение укоротили до первой строки после чтения stack', () => {
      const error = new Error(`Привет${fakeFrame}`);
      expect(error.stack).toContain(email);
      error.message = error.message.split(newline)[0] ?? '';
      expect(logEntry(error)).not.toContain(email);
    });

    // Предел: та же подделка целиком в ASCII прошла бы — по одному stack её не отличить от кадра
    it('сообщение укоротили до перевода строки, подделка с кириллицей без пробела и без @', () => {
      const phone = '79991234567';
      const error = new Error(`Привет${newline}    at /Анна_Иванова_+${phone}:1:1`);
      expect(error.stack).toContain(phone);
      error.message = 'Привет';
      const entry = logEntry(error);
      expect(entry).not.toContain(phone);
      expect(entry).toMatch(/^Error\n\s+at /);
    });

    it('сообщение укоротили посреди строки — кадры не пишутся', () => {
      const error = new Error(`okay ${email}`);
      expect(error.stack).toContain(email);
      error.message = 'okay';
      expect(logEntry(error)).toBe(skipped);
    });

    it('сообщение очистили после чтения stack — кадры не пишутся', () => {
      const error = new Error(`Привет${fakeFrame}`);
      expect(error.stack).toContain(email);
      error.message = '';
      expect(logEntry(error)).toBe(skipped);
    });

    it('строка сообщения в формате кадра, stack не меняли — её нет в записи', () => {
      const fake = '    at run (/fake/frame.js:7:7)';
      const entry = logEntry(new Error(`Привет${newline}${fake}`));
      expect(entry).not.toContain('/fake/frame.js');
      expect(entry).toMatch(/^Error\n\s+at /);
    });

    it('сообщение совпадает с именем ошибки', () => {
      const error = new Error('Error');
      error.stack = `Error: Error${fakeFrame}`;
      expect(logEntry(error)).not.toContain(email);
    });

    it('к стеку приклеен стек причины (Caused by) — его строки не идут', () => {
      const cause = new Error(`Причина${fakeFrame}`);
      cause.stack = `Error: Причина${fakeFrame}${newline}    at causeOnly (/cause/x.js:1:1)`;
      const error = new Error('Не удалось');
      const own = logEntry(error);
      error.stack += `${newline}Caused by: ${cause.stack}`;
      const entry = logEntry(error);
      expect(entry).not.toContain(email);
      expect(entry).not.toContain('Caused by');
      // Кадры причины правильного формата тоже не идут: блок обрывается на «Caused by»
      expect(entry).not.toContain('/cause/x.js');
      expect(entry).toBe(own);
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

    it('нестроковое сообщение — кадры не пишутся, даже правильного формата', () => {
      // Массив и объект с length и toString похожи на строку: заголовок совпал бы
      const lookalike = { length: 2, toString: () => 'ok' };
      for (const message of [5, ['o'], lookalike]) {
        const error = new Error('x');
        error.stack = `Error: ${String(message)}${newline}    at run (/fake/frame.js:7:7)`;
        Object.defineProperty(error, 'message', { value: message });
        expect(logEntry(error)).toBe(skipped);
      }
    });

    const escape = String.fromCharCode(27);
    it.each([
      ['имя функции с пробелом', '    at Anna Ivanova (/x.js:1:1)', 'Anna'],
      ['путь с @', `    at /home/${email}:1:1`, email],
      ['путь с @ в скобках', `    at run (/home/${email}/x.js:1:1)`, email],
      ['путь с @ в начале части и почтой дальше', `    at run (/@x/${email}/x.js:1:1)`, email],
      ['«\\@» в пути POSIX', '    at /home/anna\\@demo.ru/x.js:1:1', 'demo.ru'],
      ['«%40» в пути', '    at run (/home/anna%40demo.ru:1:1)', 'demo.ru'],
      ['полноширинное «＠» в пути', '    at /home/anna＠demo.ru:1:1', 'demo.ru'],
      ['кириллица и телефон в пути', '    at /Анна_Иванова_+79991234567:1:1', '79991234567'],
      [
        'ANSI-последовательность рисует поддельную запись',
        `    at /x${escape}[2K${escape}[1G[Nest] 1 ERROR login ok:1:1`,
        'login ok',
      ],
      // Без пробелов: строку отбрасывает сам управляющий символ, а не пробел
      ['ANSI без пробелов', `    at /x${escape}[2K${escape}[1G:1:1`, '[2K'],
      [
        'OSC с BEL меняет заголовок окна',
        `    at /x${escape}]0;title${String.fromCharCode(7)}:1:1`,
        'title',
      ],
      ['управляющий символ без скобок', `    at /x${escape}y.js:1:1`, 'y.js'],
      ['невидимый символ в пути', `    at /x${String.fromCharCode(0x200b)}y.js:1:1`, 'y.js'],
      ['разные разделители в пути C:', '    at f (C:\\x/@y.js:1:1)', 'y.js'],
    ])('кадр-подделка: %s', (_, line, secret) => {
      for (const stack of [`Error: ok${newline}${line}`, `Error: другое${newline}${line}`]) {
        const error = new Error('ok');
        error.stack = stack;
        const entry = logEntry(error);
        expect(entry, stack).not.toContain(secret);
        expect(entry, stack).not.toContain(escape);
      }
    });

    it('имя ошибки читается один раз', () => {
      const error = new Error('x');
      // V8 читает имя, когда собирает stack: собираем заранее, чтобы считать только наши чтения
      expect(error.stack).toMatch(/^Error: x/);
      let reads = 0;
      Object.defineProperty(error, 'name', {
        get: () => (reads++ === 0 ? 'Error' : `${email}${newline}[Nest] FAKE`),
      });
      const entry = logEntry(error);
      expect(entry).not.toContain(email);
      expect(entry).not.toContain('FAKE');
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
      '    at PrismaClient._request (/app/node_modules/@prisma/client/runtime/client.js:1:1)',
      '    at RouterExplorer.x (C:\\app\\node_modules\\@nestjs\\core\\router.js:1:1)',
      '    at async file:///app/dist/run.mjs:2801:20',
      '    at run (file:///C:/work/dist/run.mjs:3:7)',
      '    at C:/work/apps/api/test/x.test.ts:6:14',
      '    at run (C:/work/node_modules/@vitest/runner/dist/index.js:1:1)',
      '    at Holder.#secret (/app/dist/x.js:1:1)',
      '    at Object.<anonymous> (/app/node_modules/.bin/vite-node~x+y.js:1:1)',
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
