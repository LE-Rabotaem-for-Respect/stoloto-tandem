import { TransitionError } from '@tandem/domain';
import { ApiError } from './api-error';

// Имена классов и коды ошибок: всё прочее в этих полях в журнал не идёт
const safeName = /^[\w$.]{1,80}$/;
const safeCode = /^[\w.-]{1,40}$/;

// Тексты своих ошибок собраны из словаря и не содержат данных пользователя
const hasOwnMessage = (error: Error) =>
  error instanceof ApiError || error instanceof TransitionError;

// Кадр V8: «at функция (путь:строка:столбец)» или «at путь:строка:столбец». Функция —
// идентификаторы через точку (с async, new, [as x], <anonymous>, #приватные). Путь — белый
// список ASCII-символов по частям: «@» только в начале части (node_modules/@prisma), «\» —
// только разделитель в путях вида C:\, разделитель в одном пути одного вида (C:\… или C:/…,
// как пишут пути vitest и vite). Так не проходят почта, «%40», «＠», кириллица, управляющие
// и невидимые символы (ANSI-последовательности рисуют поддельные строки журнала)
const identifier = String.raw`(?:#?[\w$]+|<anonymous>)`;
const functionName = String.raw`(?:async )?(?:new )?${identifier}(?:\.${identifier})*(?: \[as [\w$]+\])?`;
const part = String.raw`[\w.$~+-]*`;
const posixPath = String.raw`\/@?${part}(?:\/@?${part})*`;
const windowsPath = String.raw`[A-Za-z]:(?:\\@?${part}(?:\\@?${part})*|\/@?${part}(?:\/@?${part})*)`;
const location = String.raw`(?:node:${part}(?:\/${part})*|file:\/\/(?:\/[A-Za-z]:)?${posixPath}|${windowsPath}|${posixPath}):\d+:\d+`;
const frameLine = new RegExp(
  String.raw`^ +at (?:${functionName} \(${location}\)|(?:async )?${location})$`,
);
const frameLike = /^ +at /;
const anyFrameLike = /\n +at /;

/** Строка вместо кадров, когда `stack` не совпал с сообщением */
const FRAMES_SKIPPED = '(кадры стека не записаны)';

/** Строковый код ошибки, если он похож на идентификатор (`P2002`, `ERR_INVALID_ARG_TYPE`) */
function safeCodeOf(rawCode: unknown): string | undefined {
  return typeof rawCode === 'string' && safeCode.test(rawCode) ? rawCode : undefined;
}

/** Имя в заголовке `stack`: «Имя» или, как у ошибок Node, «Имя [КОД]» с кодом самой ошибки */
function isHeaderName(head: string, code: string | undefined): boolean {
  if (safeName.test(head)) return true;
  const bracket = head.indexOf(' [');
  return (
    code !== undefined &&
    bracket > 0 &&
    safeName.test(head.slice(0, bracket)) &&
    head.slice(bracket) === ` [${code}]`
  );
}

/** Длина заголовка «имя: сообщение» (или «имя» при пустом сообщении) в начале `stack`, иначе -1. */
function headerLength(stack: string, message: unknown, code: string | undefined): number {
  if (typeof message !== 'string') return -1;
  if (!message) {
    const firstLine = stack.split('\n', 1)[0] ?? '';
    return isHeaderName(firstLine, code) ? firstLine.length : -1;
  }
  const colon = stack.indexOf(': ');
  if (colon < 0 || !isHeaderName(stack.slice(0, colon), code)) return -1;
  return stack.startsWith(message, colon + 2) ? colon + 2 + message.length : -1;
}

/**
 * Кадры стека без текста сообщения. В V8 `stack` начинается с «имя: сообщение», и строки
 * сообщения вида «    at …» иначе прошли бы за кадры. Если `stack` начинается ровно с этого
 * заголовка, кадры — сплошной блок сразу после него, до первой строки другого вида: так
 * отбрасывается и склеенное «Caused by». Если заголовок не совпал (сообщение или стек
 * изменили после создания ошибки, в том числе укоротили или очистили), где кончается
 * сообщение, уже не узнать — кадры не пишутся, вместо них пометка.
 *
 * Предел: если сообщение укоротили ровно до перевода строки, его следующие строки стоят
 * сразу за заголовком, и строка из ASCII в форме кадра (`    at /Anna_+7999…:1:1`) пройдёт.
 * Белый список отсекает лишь то, что не похоже на путь (кириллицу, `@`, пробелы, управляющие).
 */
function stackFrames(rawStack: unknown, message: unknown, code: string | undefined): string[] {
  const stack = typeof rawStack === 'string' ? rawStack : '';
  const length = headerLength(stack, message, code);
  const rest = length < 0 ? '' : stack.slice(length);
  if (length < 0 || (rest && !rest.startsWith('\n'))) {
    return anyFrameLike.test(stack) ? [FRAMES_SKIPPED] : [];
  }
  const frames: string[] = [];
  for (const line of rest.split('\n').slice(1)) {
    if (!frameLike.test(line)) break;
    // Кадры без пути (`at async Promise.all (index 0)`) блок не прерывают, но в журнал не идут
    if (frameLine.test(line)) frames.push(line);
  }
  return frames;
}

function describeError(error: Error): string {
  // Каждое поле читаем один раз: геттер мог бы отдать на проверку одно, а в журнал — другое
  const rawName: unknown = error.name;
  const message: unknown = error.message;
  const rawStack: unknown = error.stack;
  const name = typeof rawName === 'string' && safeName.test(rawName) ? rawName : 'Error';
  const code = safeCodeOf('code' in error ? error.code : undefined);
  const codePart = code === undefined ? '' : ` ${code}`;
  const head = hasOwnMessage(error)
    ? `${name}${codePart}: ${String(message)}`
    : `${name}${codePart}`;
  return [head, ...stackFrames(rawStack, message, code)].join('\n');
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
