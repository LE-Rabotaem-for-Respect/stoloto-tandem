import { TransitionError } from '@tandem/domain';
import { ApiError } from './api-error';

// Имена классов и коды ошибок: всё прочее в этих полях в журнал не идёт
const safeName = /^[\w$.]{1,80}$/;
const safeCode = /^[\w.-]{1,40}$/;

// Тексты своих ошибок собраны из словаря и не содержат данных пользователя
const hasOwnMessage = (error: Error) =>
  error instanceof ApiError || error instanceof TransitionError;

function describeError(error: Error): string {
  const name = safeName.test(error.name) ? error.name : 'Error';
  const rawCode: unknown = 'code' in error ? error.code : undefined;
  const code = typeof rawCode === 'string' && safeCode.test(rawCode) ? ` ${rawCode}` : '';
  const head = hasOwnMessage(error) ? `${name}${code}: ${error.message}` : `${name}${code}`;
  const frames = (error.stack ?? '').split('\n').filter((line) => /^\s+at /.test(line));
  return [head, ...frames].join('\n');
}

/**
 * Запись об ошибке для журнала по белому списку: имя, код и кадры стека.
 * Текст сообщения — только у своих ошибок. У остальных (Prisma, JSON.parse,
 * драйвер базы, сторонние клиенты) в нём бывают аргументы вызова и данные
 * пользователя: почта, имена, тексты. Никогда не бросает.
 */
export function logEntry(exception: unknown): string {
  try {
    if (exception instanceof Error) return describeError(exception);
    return `Брошено не Error, а ${exception === null ? 'null' : typeof exception}`;
  } catch {
    return 'Ошибка, которую не удалось описать';
  }
}
