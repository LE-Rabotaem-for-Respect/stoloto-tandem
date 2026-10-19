import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AUTH_CONFIG, loadAuthConfig } from './auth-config';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';

/** Вход, регистрация, сессии и проверка ролей для всех маршрутов api. */
@Module({
  controllers: [AuthController],
  providers: [
    // Без секрета сессий api не стартует (DECISION-002)
    { provide: AUTH_CONFIG, useFactory: () => loadAuthConfig() },
    AuthRepository,
    SessionService,
    AuthService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}
