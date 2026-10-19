import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EventStatus, OrganizationStatus } from '@tandem/domain';
import { apiRequest } from '../../shared/api';

export interface AdminOverview {
  pendingOrganizations: number;
  unpublishedEventsLastWeek: number;
  hiddenMessages: number;
}

export interface AdminOrganization {
  id: string;
  name: string;
  description: string;
  city: string;
  contacts: string;
  website: string | null;
  representativeName: string;
  representativeRole: string;
  status: OrganizationStatus;
  decisionReason: string | null;
  submittedAt: string | null;
  sports: { id: string; name: string }[];
}

export interface AdminEvent {
  id: string;
  title: string;
  sport: { id: string; name: string };
  organizer: { kind: 'user' | 'organization'; id: string; name: string };
  startsAt: string;
  city: string;
  status: EventStatus;
  statusReason: string | null;
  createdAt: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminSearch {
  q?: string;
  status?: string;
  organizationId?: string;
}

// Пустые значения в адрес не попадают: api отклоняет пустой статус
function query(search: AdminSearch): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : '';
}

const ADMIN_KEY = ['admin'] as const;

export function useAdminOverview() {
  return useQuery({
    queryKey: [...ADMIN_KEY, 'overview'],
    queryFn: () => apiRequest<AdminOverview>('/admin/overview'),
  });
}

export function useAdminOrganizations(search: AdminSearch) {
  return useQuery({
    queryKey: [...ADMIN_KEY, 'organizations', search],
    queryFn: () => apiRequest<Page<AdminOrganization>>(`/admin/organizations${query(search)}`),
  });
}

export function useAdminEvents(search: AdminSearch) {
  return useQuery({
    queryKey: [...ADMIN_KEY, 'events', search],
    queryFn: () => apiRequest<Page<AdminEvent>>(`/admin/events${query(search)}`),
  });
}

export interface DecisionBody {
  id: string;
  decision: 'approve' | 'reject';
  reason?: string;
}

/** Решение по заявке: после него обновляются очередь и плитки обзора. */
export function useOrganizationDecision() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: DecisionBody) =>
      apiRequest<AdminOrganization>(`/admin/organizations/${id}/decision`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ADMIN_KEY }),
  });
}
