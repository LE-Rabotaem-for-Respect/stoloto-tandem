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
});
