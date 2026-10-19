import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { demoAccountEmail, isDemoEmail } from '@tandem/domain';
import type { DemoAccountKey } from '@tandem/domain';
import { Clock } from '../../core/clock';
import { STAND_CONFIG } from '../../core/config';
import type { StandConfig } from '../../core/config';
import { ApiError } from '../../core/errors';
import { AuthRepository } from './auth.repository';
import type { UserWithOrganization } from './auth.repository';
import type { LoginDto, RegisterDto } from './dto';
import { hashPassword, verifyPassword } from './password';
import { SessionService } from './session.service';

export interface SignedIn {
  user: UserWithOrganization;
  token: string;
}

@Injectable()
export class AuthService {
  // Хеш для сверки, когда почты нет: ответ «неверная почта» не должен приходить быстрее «неверного пароля»
  private decoyHash?: Promise<string>;

  constructor(
    private readonly repository: AuthRepository,
    private readonly sessions: SessionService,
    private readonly clock: Clock,
    @Inject(STAND_CONFIG) private readonly config: StandConfig,
  ) {}

  /** Аккаунт организации сразу получает свою организацию в статусе `draft` (ТЗ 2.6, 2.9). */
  async register(dto: RegisterDto, previousToken?: string): Promise<SignedIn> {
    if (isDemoEmail(dto.email)) {
      throw new ApiError('validation_failed', { email: 'Адреса @demo заняты демо-аккаунтами' });
    }
    const isOrganization = dto.accountType === 'organization';
    const user = await this.repository.createUser(
      {
        role: isOrganization ? 'org' : 'user',
        name: dto.name,
        email: dto.email,
        passwordHash: await hashPassword(dto.password),
        createdAt: this.clock.now(),
      },
      isOrganization
        ? { name: dto.organizationName ?? '', representativeName: dto.name }
        : undefined,
    );
    return this.signIn(user, previousToken);
  }

  async login(dto: LoginDto, previousToken?: string): Promise<SignedIn> {
    const user = await this.repository.findUserByEmail(dto.email);
    const matches = await verifyPassword(dto.password, user?.passwordHash ?? (await this.decoy()));
    // Демо-аккаунты с общеизвестным паролем работают только на демо-стенде
    const allowed = user && matches && (this.config.demoMode || !isDemoEmail(user.email));
    if (!allowed) throw new ApiError('invalid_credentials');
    return this.signIn(user, previousToken);
  }

  /** Быстрый вход без пароля; вне демо-режима маршрута как будто нет. */
  async demoLogin(account: DemoAccountKey, previousToken?: string): Promise<SignedIn> {
    if (!this.config.demoMode) throw new ApiError('not_found');
    const user = await this.repository.findUserByEmail(demoAccountEmail(account));
    if (!user) {
      throw new ApiError('not_found', undefined, 'Демо-аккаунта нет в базе — сбросьте демо-данные');
    }
    return this.signIn(user, previousToken);
  }

  async logout(token?: string) {
    if (token) await this.sessions.end(token);
  }

  // «Сменить аккаунт»: прежняя сессия этого браузера отзывается
  private async signIn(user: UserWithOrganization, previousToken?: string): Promise<SignedIn> {
    if (previousToken) await this.sessions.end(previousToken);
    return { user, token: await this.sessions.start(user.id) };
  }

  private decoy(): Promise<string> {
    this.decoyHash ??= hashPassword(randomBytes(16).toString('hex'));
    return this.decoyHash;
  }
}
