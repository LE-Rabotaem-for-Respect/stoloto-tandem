import { TransitionError } from '@tandem/domain';
import { ApiError } from './api-error';

// Имена классов и коды ошибок: всё прочее в этих полях в журнал не идёт
const safeName = /^[\w$.]{1,80}$/;
const safeCode = /^[\w.-]{1,40}$/;

// Тексты своих ошибок собраны из словаря и не содержат данных пользователя
const hasOwnMessage = (error: Error) =>
  error instanceof ApiError || error instanceof TransitionError;

const frameLine = /^\s+at /;
// Кадр строгого формата: «at функция (путь:строка:столбец)» или «at путь:строка:столбец»
const strictFrameLine =
  /^\s+at (?:[\w$.<>[\] ]+ \()?(?:node:|file:\/\/|[A-Za-z]:[\\/]|\/)[^()\s]*:\d+:\d+\)?$/;

/**
 * Кадры стека без текста сообщения. В V8 `stack` начинается с «имя: сообщение»,
 * и строки сообщения вида «    at …» иначе прошли бы за кадры. Поэтому кадры
 * берутся только после сообщения. Если сообщения в `stack` нет (его изменили
 * после создания ошибки), остаются лишь строки строгого формата.
 */
function stackFrames(error: Error): string[] {
  const stack = error.stack ?? '';
  const { message } = error;
  const messageAt = message ? stack.indexOf(message) : 0;
  if (messageAt < 0) return stack.split('\n').filter((line) => strictFrameLine.test(line));
  return stack
    .slice(messageAt + message.length)
    .split('\n')
    .filter((line) => frameLine.test(line));
}

function describeError(error: Error): string {
  const name = safeName.test(error.name) ? error.name : 'Error';
  const rawCode: unknown = 'code' in error ? error.code : undefined;
  const code = typeof rawCode === 'string' && safeCode.test(rawCode) ? ` ${rawCode}` : '';
  const head = hasOwnMessage(error) ? `${name}${code}: ${error.message}` : `${name}${code}`;
  return [head, ...stackFrames(error)].join('\n');
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
