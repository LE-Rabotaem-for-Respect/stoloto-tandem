import type { INestApplication } from '@nestjs/common';
import { Clock, serverTime } from './core/clock';
import { ApiExceptionFilter, validationPipe } from './core/errors';

/** Общая настройка приложения: одна и та же в main.ts и в тестах; вызывать до init(). */
export function configureApp(app: INestApplication) {
  const express = app.getHttpAdapter().getInstance() as { disable(setting: string): void };
  express.disable('x-powered-by');
  app.use(serverTime(app.get(Clock)));
  app.useGlobalPipes(validationPipe());
  app.useGlobalFilters(new ApiExceptionFilter());
  return app;
}
