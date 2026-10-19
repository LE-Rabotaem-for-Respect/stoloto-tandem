import { Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiError } from '../../core/errors';
import { AUTH_CONFIG } from './auth-config';
import type { AuthConfig } from './auth-config';
import { readCookie } from './cookies';
import { PUBLIC_KEY, ROLES_KEY, toActor } from './roles';
import type { AuthRequest, SignedInRole } from './roles';
import { SessionService } from './session.service';

type Access = 'public' | SignedInRole[];

/**
 * Глобальный guard: по cookie находит сессию и кладёт в запрос `actor`,
 * затем проверяет доступ маршрута: `@Public()` — всем, `@Roles(...)` —
 * этим ролям, без метки — любому вошедшему. Без cookie базу не трогает.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = readCookie(request.headers.cookie, this.config.cookieName);
    const user = token ? await this.sessions.resolve(token) : null;
    if (user && token) {
      request.user = user;
      request.sessionToken = token;
      request.actor = toActor(user);
    } else {
      request.actor = { role: 'guest' };
    }

    // Метка метода важнее метки контроллера; без меток — только для вошедших
    const access = this.accessOf(context.getHandler()) ?? this.accessOf(context.getClass());
    if (access === 'public') return true;
    if (request.actor.role === 'guest') throw new ApiError('unauthorized');
    if (access && !access.includes(request.actor.role)) throw new ApiError('forbidden');
    return true;
  }

  private accessOf(target: ReturnType<ExecutionContext['getHandler']>): Access | undefined {
    const roles = this.reflector.get<SignedInRole[] | undefined>(ROLES_KEY, target);
    if (roles) return roles;
    return this.reflector.get<boolean | undefined>(PUBLIC_KEY, target) ? 'public' : undefined;
  }
}
