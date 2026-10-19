import { createHmac, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../../core/clock';
import { AUTH_CONFIG } from './auth-config';
import type { AuthConfig } from './auth-config';
import { AuthRepository } from './auth.repository';
import type { UserWithOrganization } from './auth.repository';

/**
 * Сессии (DECISION-003): в cookie — случайный токен, в базе — только его
 * HMAC с секретом стенда. Срок жизни считается по настоящему времени,
 * а не по демо-часам.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly clock: Clock,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  hashToken(token: string): string {
    return createHmac('sha256', this.config.sessionSecret).update(token).digest('hex');
  }

  /** Начинает сессию и возвращает токен для cookie. */
  async start(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const now = this.clock.realNow();
    await this.repository.createSession({
      userId,
      tokenHash: this.hashToken(token),
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.config.sessionTtlMs),
    });
    return token;
  }

  /** Пользователь действующей сессии; отозванная, истёкшая или чужая — `null`. */
  resolve(token: string): Promise<UserWithOrganization | null> {
    return this.repository.findSessionUser(this.hashToken(token), this.clock.realNow());
  }

  async end(token: string) {
    await this.repository.revokeSession(this.hashToken(token), this.clock.realNow());
  }
}
