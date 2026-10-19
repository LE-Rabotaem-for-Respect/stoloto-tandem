import { ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { ApiError } from './api-error';
import type { ErrorFields } from './api-error';

const hasCyrillic = /[А-Яа-яЁё]/;

// Тексты задаёт DTO в декораторах; английские тексты class-validator по умолчанию человеку не показываем
function fieldMessage(error: ValidationError): string {
  const constraints = error.constraints ?? {};
  if ('whitelistValidation' in constraints) return 'Лишнее поле';
  const first = Object.values(constraints)[0];
  return first && hasCyrillic.test(first) ? first : 'Проверьте значение';
}

function collectFields(errors: ValidationError[], prefix = '', fields: ErrorFields = {}) {
  for (const error of errors) {
    const path = prefix + error.property;
    if (error.constraints) fields[path] = fieldMessage(error);
    if (error.children?.length) collectFields(error.children, `${path}.`, fields);
  }
  return fields;
}

/** Глобальная проверка DTO: лишние поля отклоняются, ошибки — в `fields`. */
export const validationPipe = () =>
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => new ApiError('validation_failed', collectFields(errors)),
  });
