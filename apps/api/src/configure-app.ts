import type { INestApplication } from '@nestjs/common';
import { Clock, serverTime } from './core/clock';
import { ApiExceptionFilter, sameOriginWrites, validationPipe } from './core/errors';

/** Общая настройка приложения: одна и та же в main.ts и в тестах; вызывать до init(). */
export function configureApp(app: INestApplication) {
  const express = app.getHttpAdapter().getInstance() as {
    disable(setting: string): void;
    set(setting: string, value: string): void;
  };
  express.disable('x-powered-by');
  // Адрес клиента — из X-Forwarded-For, но доверяем ему только от внутренних сетей (nginx web
  // в Docker). Порт api опубликован только на 127.0.0.1 (docker-compose.yml): снаружи до api
  // доходят только запросы через web, а он перезаписывает заголовок адресом клиента
  express.set('trust proxy', 'loopback, linklocal, uniquelocal');
  app.use(serverTime(app.get(Clock)));
  app.use(sameOriginWrites());
  app.useGlobalPipes(validationPipe());
  app.useGlobalFilters(new ApiExceptionFilter());
  return app;
}
