import type { INestApplication } from '@nestjs/common';
import { ApiExceptionFilter, validationPipe } from './core/errors';

/** Общая настройка приложения: одна и та же в main.ts и в тестах. */
export function configureApp(app: INestApplication) {
  app.useGlobalPipes(validationPipe());
  app.useGlobalFilters(new ApiExceptionFilter());
  return app;
}
