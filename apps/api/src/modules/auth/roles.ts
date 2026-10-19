import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Actor } from '../../core/policies';
import type { UserWithOrganization } from './auth.repository';

export { PUBLIC_KEY, Public, ROLES_KEY, Roles, SignedIn } from '../../core/access';
export type { SignedInRole } from '../../core/access';

/** Что guard кладёт в запрос: кто действует и чем вошёл. */
export interface AuthRequest {
  headers: { cookie?: string };
  /** Адрес клиента по `trust proxy` Express. */
  ip?: string;
  actor?: Actor;
  user?: UserWithOrganization;
  sessionToken?: string;
}

/** Кто выполняет запрос; без входа — гость. */
export const CurrentActor = createParamDecorator(
  (_: unknown, context: ExecutionContext): Actor =>
    context.switchToHttp().getRequest<AuthRequest>().actor ?? { role: 'guest' },
);

/** Роль и организация — из базы по сессии, а не из запроса. */
export function toActor(user: UserWithOrganization): Actor {
  if (user.role === 'admin') return { role: 'admin', userId: user.id };
  if (user.role === 'org') {
    if (!user.organization) throw new Error(`У аккаунта организации ${user.id} нет организации`);
    return {
      role: 'org',
      userId: user.id,
      organization: { id: user.organization.id, status: user.organization.status },
    };
  }
  return { role: 'user', userId: user.id };
}
