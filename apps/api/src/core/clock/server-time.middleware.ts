import { Injectable } from '@nestjs/common';
import type { NestMiddleware } from '@nestjs/common';
import { Clock } from './clock';

interface HeaderResponse {
  setHeader(name: string, value: string): void;
}

/** Каждый ответ API несёт время сервера, в том числе ответ с ошибкой. */
@Injectable()
export class ServerTimeMiddleware implements NestMiddleware {
  constructor(private readonly clock: Clock) {}

  use(_request: unknown, response: HeaderResponse, next: () => void) {
    response.setHeader('X-Server-Time', this.clock.now().toISOString());
    next();
  }
}
