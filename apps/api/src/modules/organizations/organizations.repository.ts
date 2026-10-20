import { Injectable } from '@nestjs/common';
import type { OrganizationStatus, Prisma } from '../../generated/prisma/client';
import { escapeLike } from '../../core/prisma/like';
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

  /**
   * Админка: заявки на проверке — по времени отправки (кто раньше отправил, тот выше),
   * остальные — по названию.
   */
  async adminSearch(
    filter: { text?: string; status?: OrganizationStatus; id?: string },
    page: { offset: number; limit: number },
  ): Promise<{ organizations: OrganizationRecord[]; total: number }> {
    const where: Prisma.OrganizationWhereInput = {
      ...(filter.id && { id: filter.id }),
      ...(filter.status && { status: filter.status }),
      ...(filter.text && {
        name: { contains: escapeLike(filter.text), mode: 'insensitive' as const },
      }),
    };
    const [organizations, total] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        include: withSports,
        orderBy:
          filter.status === 'pending'
            ? [{ submittedAt: 'asc' }, { id: 'asc' }]
            : [{ name: 'asc' }, { id: 'asc' }],
        skip: page.offset,
        take: page.limit,
      }),
      this.prisma.organization.count({ where }),
    ]);
    return { organizations, total };
  }

  countByStatus(status: OrganizationStatus): Promise<number> {
    return this.prisma.organization.count({ where: { status } });
  }

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
