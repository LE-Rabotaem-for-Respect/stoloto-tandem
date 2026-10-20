import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AUTH_CONFIG } from './auth-config';
import type { AuthConfig } from './auth-config';
import { AuthService } from './auth.service';
import type { SignedIn } from './auth.service';
import { clearSessionCookie, setSessionCookie } from './cookies';
import { DemoModeGuard } from './demo-mode.guard';
import type { CookieResponse } from './cookies';
import { DemoLoginDto, LoginDto, RegisterDto, UpdateSettingsDto } from './dto';
import { Public, SignedIn as SignedInOnly } from './roles';
import type { AuthRequest } from './roles';
import { toSelfView } from './user-view';
import type { SelfView } from './user-view';

// Адрес клиента: за nginx — из X-Forwarded-For (trust proxy только для внутренних сетей)
const clientIp = (req: AuthRequest) => req.ip ?? 'unknown';

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  @Post('auth/register')
  @Public()
  async register(
    @Body() dto: RegisterDto,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<SelfView> {
    return this.respond(await this.auth.register(dto, clientIp(req), req.sessionToken), res);
  }

  @Post('auth/login')
  @Public()
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<SelfView> {
    return this.respond(await this.auth.login(dto, clientIp(req), req.sessionToken), res);
  }

  @Post('auth/demo-login')
  @Public()
  @UseGuards(DemoModeGuard)
  @HttpCode(200)
  async demoLogin(
    @Body() dto: DemoLoginDto,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<SelfView> {
    return this.respond(await this.auth.demoLogin(dto.account, req.sessionToken), res);
  }

  @Post('auth/logout')
  @Public()
  @HttpCode(204)
  async logout(@Req() req: AuthRequest, @Res({ passthrough: true }) res: CookieResponse) {
    await this.auth.logout(req.sessionToken);
    clearSessionCookie(res, this.config.cookieName);
  }

  // Свои данные аккаунта: не кешируются, как и все ответы api (noStore в configure-app)
  @Get('me')
  @SignedInOnly()
  me(@Req() req: AuthRequest): SelfView {
    // Guard пропускает сюда только запрос с действующей сессией
    if (!req.user) throw new Error('Нет пользователя сессии после проверки входа');
    return toSelfView(req.user);
  }

  // Настройки оформления — только свои: адрес без id, пользователь — из сессии
  @Patch('me/settings')
  @SignedInOnly()
  async updateSettings(@Req() req: AuthRequest, @Body() dto: UpdateSettingsDto): Promise<SelfView> {
    if (!req.user) throw new Error('Нет пользователя сессии после проверки входа');
    return toSelfView(await this.auth.updateSettings(req.user, dto));
  }

  private respond({ user, token }: SignedIn, res: CookieResponse): SelfView {
    setSessionCookie(res, this.config.cookieName, token, {
      maxAge: this.config.sessionTtlMs,
      secure: this.config.cookieSecure,
    });
    return toSelfView(user);
  }
}
