import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { TransitionError, errorMessage } from '@tandem/domain';
import type { ErrorCode } from '@tandem/domain';
import { Prisma } from '../../generated/prisma/client';
import { ApiError } from './api-error';
import type { ErrorFields } from './api-error';
import { ERROR_HTTP_STATUS } from './http-status';

interface ErrorBody {
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
};

function uniqueFields(meta: Record<string, unknown> | undefined): ErrorFields | undefined {
  const target = meta?.target;
  const names = Array.isArray(target) ? target : typeof target === 'string' ? [target] : [];
  if (!names.length) return undefined;
  return Object.fromEntries(names.map((name) => [String(name), 'Такое значение уже занято']));
}

/** Переводит любую ошибку в `{ code, message, fields? }` (DECISION-002, #246). */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiError');

  catch(exception: unknown, host: ArgumentsHost) {
    const body = this.toBody(exception);
    host.switchToHttp().getResponse<JsonResponse>().status(ERROR_HTTP_STATUS[body.code]).json(body);
  }

  private toBody(exception: unknown): ErrorBody {
    if (exception instanceof ApiError) {
      return { code: exception.code, message: exception.message, fields: exception.fields };
    }
    if (exception instanceof TransitionError) {
      return { code: exception.code, message: exception.message };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          code: 'conflict',
          message: errorMessage('conflict'),
          fields: uniqueFields(exception.meta),
        };
      }
      if (exception.code === 'P2025')
        return { code: 'not_found', message: errorMessage('not_found') };
      if (exception.code === 'P2028') return { code: 'busy', message: errorMessage('busy') };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status < 500) {
        const code = httpStatusCodes[status] ?? 'validation_failed';
        return { code, message: errorMessage(code) };
      }
    }
    this.logger.error(
      exception instanceof Error ? (exception.stack ?? exception.message) : exception,
    );
    return { code: 'internal', message: errorMessage('internal') };
  }
}
