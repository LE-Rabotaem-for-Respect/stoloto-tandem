import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Action,
  EventDisplayStatus,
  ParticipationStatus,
  SportCategory,
} from '@tandem/domain';
import { apiRequest } from '../../shared/api';
import type { EventLevel } from '../../shared/ui';

/** Карточка мероприятия (`GET /events/:id`): время — строками ISO. */
export interface EventCardView {
  id: string;
  title: string;
  description: string;
  sport: { id: string; name: string; category: SportCategory; isCustom: boolean };
  organizer: { kind: 'user' | 'organization'; id: string; name: string };
  startsAt: string;
  endsAt: string;
  previousStartsAt: string | null;
  city: string;
  area: string;
  placeText: string;
  mode: 'free' | 'approval';
  applyQuestion: string | null;
  level: EventLevel;
  status: string;
  statusReason: string | null;
  displayStatus: EventDisplayStatus;
  /** Запись того, кто смотрит; `null` — записи нет. */
  participation: ParticipationStatus | null;
  /** Только участникам, организатору и администратору; остальным — `null`. */
  participantInfo: string | null;
  actions: Action[];
}

export const eventCardKey = (id: string) => ['event', id] as const;

export function useEventCard(id: string) {
  return useQuery({
    queryKey: eventCardKey(id),
    queryFn: () => apiRequest<EventCardView>(`/events/${encodeURIComponent(id)}`),
  });
}

/** Записаться или подать заявку; после ответа карточка перечитывается. */
export function useJoinEvent(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<unknown>(`/events/${encodeURIComponent(id)}/join`, { method: 'POST', body: {} }),
    onSettled: () => client.invalidateQueries({ queryKey: eventCardKey(id) }),
  });
}
