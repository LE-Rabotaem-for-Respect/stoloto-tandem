import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EventDisplayStatus, OrganizationStatus, SportCategory } from '@tandem/domain';
import { apiRequest } from '../../shared/api';
import { ME_KEY } from '../auth/api';

export interface OrganizationSport {
  id: string;
  name: string;
  category: SportCategory;
}

/** Профиль, который видят все, — `GET /organizations/:id` одобренной организации. */
export interface PublicOrganization {
  id: string;
  name: string;
  description: string;
  city: string;
  contacts: string;
  website: string | null;
  sports: OrganizationSport[];
}

/** Свой профиль: ещё представитель, статус проверки и причина решения. */
export interface OwnOrganization extends PublicOrganization {
  representativeName: string;
  representativeRole: string;
  status: OrganizationStatus;
  decisionReason: string | null;
  submittedAt: string | null;
}

/** Поля формы профиля — тело `PATCH /organizations/:id`. */
export interface OrganizationProfile {
  name: string;
  description: string;
  city: string;
  contacts: string;
  /** Пустая строка — сайта нет. */
  website: string;
  representativeName: string;
  representativeRole: string;
  sportIds: string[];
}

export interface OrganizationEvent {
  id: string;
  title: string;
  sport: { name: string; category: SportCategory };
  startsAt: string;
  endsAt: string;
  city: string;
  area: string;
  displayStatus: EventDisplayStatus;
}

interface SportSearchResult {
  items: (OrganizationSport & { isCustom: boolean })[];
}

const organizationKey = (id: string) => ['organization', id] as const;

export function useOrganization<T extends PublicOrganization = PublicOrganization>(id: string) {
  return useQuery({
    queryKey: organizationKey(id),
    queryFn: () => apiRequest<T>(`/organizations/${encodeURIComponent(id)}`),
  });
}

/** Ближайшие мероприятия организации — из ленты: только опубликованные и не завершённые. */
export const ORGANIZATION_EVENTS_LIMIT = 50;

export function useOrganizationEvents(id: string) {
  return useQuery({
    queryKey: ['organization', id, 'events'],
    queryFn: () =>
      apiRequest<{ items: OrganizationEvent[]; total: number }>(
        `/events?organization=${encodeURIComponent(id)}&limit=${ORGANIZATION_EVENTS_LIMIT}`,
      ),
  });
}

/**
 * «Сохранить» и «Отправить на проверку». Отправка сначала сохраняет форму:
 * на проверку уходит то, что человек видит, а не прошлая версия профиля.
 */
export function useOrganizationActions(id: string) {
  const client = useQueryClient();
  const path = `/organizations/${encodeURIComponent(id)}`;
  // Название и статус организации показывает и `/me` (шапка, профиль)
  const store = (organization: OwnOrganization) => {
    client.setQueryData(organizationKey(id), organization);
    void client.invalidateQueries({ queryKey: ME_KEY });
  };

  const save = useMutation({
    mutationFn: (profile: OrganizationProfile) =>
      apiRequest<OwnOrganization>(path, { method: 'PATCH', body: profile }),
    onSuccess: store,
  });
  const submit = useMutation({
    mutationFn: async (profile: OrganizationProfile) => {
      store(await apiRequest<OwnOrganization>(path, { method: 'PATCH', body: profile }));
      return apiRequest<OwnOrganization>(`${path}/submit`, { method: 'POST' });
    },
    onSuccess: store,
  });
  return { save, submit };
}

export function useSportSearch(query: string) {
  return useQuery({
    enabled: query.trim() !== '',
    queryKey: ['sports', query],
    queryFn: () => apiRequest<SportSearchResult>(`/sports?q=${encodeURIComponent(query)}&limit=8`),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}
