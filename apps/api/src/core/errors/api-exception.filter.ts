import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { TransitionError, errorMessage } from '@tandem/domain';
import type { ErrorCode } from '@tandem/domain';
import { Prisma } from '../../generated/prisma/client';
import { ApiError } from './api-error';
import type { ErrorFields } from './api-error';
import { ERROR_HTTP_STATUS } from './http-status';

export interface ErrorBody {
  code: ErrorCode;
  message: string;
  fields?: ErrorFields;
}

/** То немногое от ответа Express, что нужно фильтру. */
interface JsonResponse {
  status(code: number): { json(body: ErrorBody): void };
}

const httpStatusCodes: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.UNAUTHORIZED]: 'unauthorized',
  [HttpStatus.FORBIDDEN]: 'forbidden',
  [HttpStatus.NOT_FOUND]: 'not_found',
  [HttpStatus.CONFLICT]: 'conflict',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'too_large',
};

/**
 * Уникальные индексы, за которыми стоит поле формы. Остальные уникальности
 * служебные (токены, журналы, записи) — их нарушение отдаётся без `fields`.
 */
const UNIQUE_FIELD_ERRORS: Record<string, ErrorFields> = {
  users_email_key: { email: 'Эта почта уже зарегистрирована' },
  sports_normalized_name_key: { name: 'Такое направление уже есть' },
};

// У Prisma 7 с @prisma/adapter-pg имя индекса лежит в meta.driverAdapterError.cause.constraint
function uniqueIndex(meta: Record<string, unknown> | undefined): string | undefined {
  const adapterError = meta?.driverAdapterError as
    { cause?: { constraint?: { index?: unknown } } } | undefined;
  const index = adapterError?.cause?.constraint?.index;
  return typeof index === 'string' ? index : undefined;
}

// HttpException Nest или ошибка разбора тела (http-errors у body-parser): у обеих есть HTTP-код
function clientErrorStatus(exception: unknown): number | undefined {
  if (exception instanceof HttpException) return exception.getStatus();
  if (exception instanceof Error && 'status' in exception && typeof exception.status === 'number') {
    return exception.status;
  }
  return undefined;
}

const isPrismaError = (exception: unknown): exception is Error =>
  exception instanceof Prisma.PrismaClientKnownRequestError ||
  exception instanceof Prisma.PrismaClientUnknownRequestError ||
  exception instanceof Prisma.PrismaClientValidationError ||
  exception instanceof Prisma.PrismaClientInitializationError ||
  exception instanceof Prisma.PrismaClientRustPanicError;

// В тексте ошибок Prisma — аргументы вызова со значениями полей: в журнал их не пишем
function logEntry(exception: unknown): string {
  if (!(exception instanceof Error)) return String(exception);
  if (!isPrismaError(exception)) return exception.stack ?? exception.message;
  const code = 'code' in exception ? ` ${String(exception.code)}` : '';
  const frames = (exception.stack ?? '').split('\n').filter((line) => /^\s+at /.test(line));
  return [`${exception.name}${code}`, ...frames].join('\n');
}

/** Ошибка → `{ code, message, fields? }`; `undefined` — непредвиденная. */
function knownErrorBody(exception: unknown): ErrorBody | undefined {
  if (exception instanceof ApiError) {
    return { code: exception.code, message: exception.message, fields: exception.fields };
  }
  if (exception instanceof TransitionError) {
    return { code: exception.code, message: exception.message };
  }
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    if (exception.code === 'P2002') {
      const index = uniqueIndex(exception.meta);
      const fields = index ? UNIQUE_FIELD_ERRORS[index] : undefined;
      return { code: 'conflict', message: errorMessage('conflict'), ...(fields && { fields }) };
    }
    if (exception.code === 'P2025')
      return { code: 'not_found', message: errorMessage('not_found') };
    if (exception.code === 'P2028') return { code: 'busy', message: errorMessage('busy') };
  }
  const status = clientErrorStatus(exception);
  if (status !== undefined && status >= 400 && status < 500) {
    const code = httpStatusCodes[status] ?? 'validation_failed';
    return { code, message: errorMessage(code) };
  }
  return undefined;
}

const internal = (): ErrorBody => ({ code: 'internal', message: errorMessage('internal') });

/** Тело ответа для любой ошибки: так её увидит клиент. */
export function toErrorBody(exception: unknown): ErrorBody {
  return knownErrorBody(exception) ?? internal();
}

/** Переводит любую ошибку в `{ code, message, fields? }` (DECISION-002). */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiError');

  catch(exception: unknown, host: ArgumentsHost) {
    const body = knownErrorBody(exception);
    if (!body) this.logger.error(logEntry(exception));
    const response = body ?? internal();
    host
      .switchToHttp()
      .getResponse<JsonResponse>()
      .status(ERROR_HTTP_STATUS[response.code])
      .json(response);
  }
}
