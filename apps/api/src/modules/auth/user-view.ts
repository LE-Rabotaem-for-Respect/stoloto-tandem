import type { OrganizationStatus, Prisma, UserRole } from '../../generated/prisma/client';
import type { UserWithOrganization } from './auth.repository';

/**
 * Пользователь — самому себе (DECISION-003, белый список полей): без
 * `password_hash`; почта и настройки видны только владельцу аккаунта.
 */
export interface SelfView {
  id: string;
  role: UserRole;
  name: string;
  email: string;
  city: string | null;
  bio: string | null;
  settings: Prisma.JsonValue;
  organization: { id: string; name: string; status: OrganizationStatus } | null;
}

export function toSelfView(user: UserWithOrganization): SelfView {
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    city: user.city,
    bio: user.bio,
    settings: user.settings,
    organization: user.organization,
  };
}
