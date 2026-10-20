import { Injectable } from '@nestjs/common';
import type { Prisma, UserRole } from '../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';

const withOrganization = {
  organization: { select: { id: true, name: true, status: true } },
} as const;

export type UserWithOrganization = Prisma.UserGetPayload<{ include: typeof withOrganization }>;

export interface NewUser {
  role: Exclude<UserRole, 'admin'>;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

/** Черновик организации, который получает аккаунт `role = org` при регистрации (ТЗ 2.6, 2.9). */
export interface NewOrganization {
  name: string;
  representativeName: string;
}

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findUserByEmail(email: string): Promise<UserWithOrganization | null> {
    return this.prisma.user.findUnique({ where: { email }, include: withOrganization });
  }

  // Аккаунт и черновик организации создаются одним запросом — либо оба, либо ничего
  createUser(user: NewUser, organization?: NewOrganization): Promise<UserWithOrganization> {
    return this.prisma.user.create({
      data: {
        ...user,
        organization: organization && {
          create: {
            name: organization.name,
            description: '',
            city: '',
            contacts: '',
            representativeName: organization.representativeName,
            representativeRole: '',
          },
        },
      },
      include: withOrganization,
    });
  }

  async createSession(session: {
    userId: string;
    tokenHash: string;
    createdAt: Date;
    expiresAt: Date;
  }) {
    await this.prisma.session.create({ data: session });
  }

  async findSessionUser(tokenHash: string, now: Date): Promise<UserWithOrganization | null> {
    const session = await this.prisma.session.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
      include: { user: { include: withOrganization } },
    });
    return session?.user ?? null;
  }

  /**
   * Сливает изменение в `settings.theme` одним UPDATE: два одновременных запроса
   * («Крупный текст» и «Контраст») не затирают друг друга, остальные ключи `settings`
   * не трогаются. Не объект в `settings` или `theme` считается пустым.
   */
  async mergeTheme(userId: string, theme: Record<string, boolean>): Promise<UserWithOrganization> {
    await this.prisma.$executeRaw`
      UPDATE "users" SET "settings" = jsonb_set(
        CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END,
        '{theme}',
        CASE WHEN jsonb_typeof("settings" -> 'theme') = 'object'
          THEN "settings" -> 'theme' ELSE '{}'::jsonb END || ${JSON.stringify(theme)}::jsonb
      )
      WHERE "id" = ${userId}::uuid`;
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: withOrganization,
    });
  }

  async revokeSession(tokenHash: string, now: Date) {
    await this.prisma.session.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: now },
    });
  }
}
