import { Injectable } from '@nestjs/common';
import type { OrganizationStatus, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';

const withSports = {
  sports: { select: { sport: { select: { id: true, name: true, category: true } } } },
} as const;

export type OrganizationRecord = Prisma.OrganizationGetPayload<{ include: typeof withSports }>;

export interface ProfileChanges {
  name?: string;
  description?: string;
  city?: string;
  contacts?: string;
  website?: string | null;
  representativeName?: string;
  representativeRole?: string;
}

export interface StatusChange {
  status: OrganizationStatus;
  submittedAt?: Date;
  decisionReason: string | null;
  decidedById: string | null;
  decidedAt: Date | null;
}

@Injectable()
export class OrganizationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  find(id: string): Promise<OrganizationRecord | null> {
    return this.prisma.organization.findUnique({ where: { id }, include: withSports });
  }

  // Профиль и направления меняются вместе: без половины правки
  updateProfile(
    id: string,
    changes: ProfileChanges,
    sportIds?: readonly string[],
  ): Promise<OrganizationRecord> {
    return this.prisma.$transaction(async (tx) => {
      if (sportIds) {
        await tx.organizationSport.deleteMany({ where: { organizationId: id } });
        await tx.organizationSport.createMany({
          data: sportIds.map((sportId) => ({ organizationId: id, sportId })),
        });
      }
      return tx.organization.update({ where: { id }, data: changes, include: withSports });
    });
  }

  /** Меняет статус, только если он всё ещё прежний: два одновременных решения не пройдут оба. */
  async changeStatus(id: string, from: OrganizationStatus, change: StatusChange): Promise<boolean> {
    const { count } = await this.prisma.organization.updateMany({
      where: { id, status: from },
      data: change,
    });
    return count === 1;
  }
}
