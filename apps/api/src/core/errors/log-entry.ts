import { Prisma } from '../../generated/prisma/client';

const isPrismaError = (exception: Error): boolean =>
  exception instanceof Prisma.PrismaClientKnownRequestError ||
  exception instanceof Prisma.PrismaClientUnknownRequestError ||
  exception instanceof Prisma.PrismaClientValidationError ||
  exception instanceof Prisma.PrismaClientInitializationError ||
  exception instanceof Prisma.PrismaClientRustPanicError;

// В тексте ошибок Prisma — аргументы вызова со значениями полей: в журнал их не пишем
export function logEntry(exception: unknown): string {
  if (!(exception instanceof Error)) return String(exception);
  if (!isPrismaError(exception)) return exception.stack ?? exception.message;
  const code = 'code' in exception ? ` ${String(exception.code)}` : '';
  const frames = (exception.stack ?? '').split('\n').filter((line) => /^\s+at /.test(line));
  return [`${exception.name}${code}`, ...frames].join('\n');
}
