import { TransitionError } from '@tandem/domain';
import { ApiError } from './api-error';

// Имена классов и коды ошибок: всё прочее в этих полях в журнал не идёт
const safeName = /^[\w$.]{1,80}$/;
const safeCode = /^[\w.-]{1,40}$/;

// Тексты своих ошибок собраны из словаря и не содержат данных пользователя
const hasOwnMessage = (error: Error) =>
  error instanceof ApiError || error instanceof TransitionError;

// Кадр V8: «at функция (путь:строка:столбец)» или «at путь:строка:столбец». Функция —
// идентификаторы через точку (с async, new, [as x], <anonymous>), путь — без пробелов и «@»:
// в имени с пробелом или в пути с «@» мог оказаться текст сообщения
const identifier = String.raw`(?:[\w$]+|<anonymous>)`;
const functionName = String.raw`(?:async )?(?:new )?${identifier}(?:\.${identifier})*(?: \[as [\w$]+\])?`;
const location = String.raw`(?:node:|file:\/\/|[A-Za-z]:[\\/]|\/)[^()\s@]*:\d+:\d+`;
const frameLine = new RegExp(String.raw`^ +at (?:${functionName} \(${location}\)|${location})$`);
const frameLike = /^ +at /;

/** Длина заголовка «имя: сообщение» (или «имя» при пустом сообщении) в начале `stack`, иначе -1. */
function headerLength(stack: string, message: unknown): number {
  if (typeof message !== 'string') return -1;
  if (!message) {
    const firstLine = stack.split('\n', 1)[0] ?? '';
    return safeName.test(firstLine) ? firstLine.length : -1;
  }
  const colon = stack.indexOf(': ');
  if (colon < 0 || !safeName.test(stack.slice(0, colon))) return -1;
  return stack.startsWith(message, colon + 2) ? colon + 2 + message.length : -1;
}

/**
 * Кадры стека без текста сообщения. В V8 `stack` начинается с «имя: сообщение», и строки
 * сообщения вида «    at …» иначе прошли бы за кадры. Если `stack` начинается ровно с этого
 * заголовка, кадры — сплошной блок сразу после него, до первой строки другого вида: так
 * отбрасывается и склеенное «Caused by». Если заголовок не совпал (сообщение или стек
 * изменили после создания ошибки), остаются лишь строки формата кадра из всего `stack`.
 */
function stackFrames(error: Error): string[] {
  const stack = typeof error.stack === 'string' ? error.stack : '';
  const length = headerLength(stack, error.message);
  if (length < 0) return stack.split('\n').filter((line) => frameLine.test(line));
  const rest = stack.slice(length);
  if (rest && !rest.startsWith('\n')) return [];
  const frames: string[] = [];
  for (const line of rest.split('\n').slice(1)) {
    if (!frameLike.test(line)) break;
    // Кадры без пути (`at async Promise.all (index 0)`) блок не прерывают, но в журнал не идут
    if (frameLine.test(line)) frames.push(line);
  }
  return frames;
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
