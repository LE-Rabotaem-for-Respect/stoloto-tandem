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
import { AUTH_LIMITS, AttemptLimiter } from './attempt-limiter';
import type { AuthLimits } from './attempt-limiter';
import { PasswordHasher } from './password-hasher';
import { SessionService } from './session.service';

export interface SignedIn {
  user: UserWithOrganization;
  token: string;
}

const EMAIL_TAKEN = { email: 'Эта почта уже зарегистрирована' };

@Injectable()
export class AuthService {
  private readonly loginPerIp: AttemptLimiter;
  private readonly loginPerEmail: AttemptLimiter;
  private readonly registerPerIp: AttemptLimiter;
  private readonly registerPerEmail: AttemptLimiter;

  constructor(
    private readonly repository: AuthRepository,
    private readonly sessions: SessionService,
    private readonly passwords: PasswordHasher,
    private readonly clock: Clock,
    @Inject(STAND_CONFIG) private readonly config: StandConfig,
    @Inject(AUTH_LIMITS) limits: AuthLimits,
  ) {
    const realNow = () => clock.realNow().getTime();
    this.loginPerIp = new AttemptLimiter(limits.loginPerIp, realNow);
    this.loginPerEmail = new AttemptLimiter(limits.loginPerEmail, realNow);
    this.registerPerIp = new AttemptLimiter(limits.registerPerIp, realNow);
    this.registerPerEmail = new AttemptLimiter(limits.registerPerEmail, realNow);
  }

  /**
   * Аккаунт организации сразу получает свою организацию в статусе `draft`
   * (ТЗ 2.6, 2.9). Хеш пароля считается последним: после лимита и проверки почты.
   */
  async register(dto: RegisterDto, ip: string, previousToken?: string): Promise<SignedIn> {
    this.registerPerIp.hit(ip);
    this.registerPerEmail.hit(dto.email);
    if (await this.repository.findUserByEmail(dto.email)) {
      throw new ApiError('conflict', EMAIL_TAKEN);
    }
    const isOrganization = dto.accountType === 'organization';
    const user = await this.repository.createUser(
      {
        role: isOrganization ? 'org' : 'user',
        name: dto.name,
        email: dto.email,
        passwordHash: await this.passwords.hash(dto.password),
        createdAt: this.clock.now(),
      },
      isOrganization
        ? { name: dto.organizationName ?? '', representativeName: dto.name }
        : undefined,
    );
    return this.signIn(user, previousToken);
  }

  /** Перебор паролей ограничен и по адресу, и по почте. */
  async login(dto: LoginDto, ip: string, previousToken?: string): Promise<SignedIn> {
    this.loginPerIp.hit(ip);
    this.loginPerEmail.hit(dto.email);
    const user = await this.repository.findUserByEmail(dto.email);
    const matches = await this.passwords.verify(dto.password, user?.passwordHash);
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
}
