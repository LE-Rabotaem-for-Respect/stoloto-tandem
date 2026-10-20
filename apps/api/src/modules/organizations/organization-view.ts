import type { Action } from '@tandem/domain';
import type { OrganizationStatus, SportCategory } from '../../generated/prisma/client';
import type { OrganizationRecord } from './organizations.repository';

interface SportView {
  id: string;
  name: string;
  category: SportCategory;
}

/** Публичная страница одобренной организации — без представителя (DECISION-003). */
export interface PublicOrganizationView {
  id: string;
  name: string;
  description: string;
  city: string;
  contacts: string;
  website: string | null;
  sports: SportView[];
}

/** Своя организация и взгляд администратора: заявка, статус и причина решения. */
export interface OwnOrganizationView extends PublicOrganizationView {
  representativeName: string;
  representativeRole: string;
  status: OrganizationStatus;
  decisionReason: string | null;
  submittedAt: string | null;
  /** Правка, отправка на проверку, создание мероприятия, решение по заявке (DECISION-002). */
  actions: Action[];
}

export function toPublicView(organization: OrganizationRecord): PublicOrganizationView {
  return {
    id: organization.id,
    name: organization.name,
    description: organization.description,
    city: organization.city,
    contacts: organization.contacts,
    website: organization.website,
    sports: organization.sports.map(({ sport }) => sport),
  };
}

export function toOwnView(
  organization: OrganizationRecord,
  actions: Action[],
): OwnOrganizationView {
  return {
    ...toPublicView(organization),
    representativeName: organization.representativeName,
    representativeRole: organization.representativeRole,
    status: organization.status,
    decisionReason: organization.decisionReason,
    submittedAt: organization.submittedAt?.toISOString() ?? null,
    actions,
  };
}
