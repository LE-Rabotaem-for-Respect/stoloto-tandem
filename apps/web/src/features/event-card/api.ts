import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Action,
  EventDisplayStatus,
  EventLevel,
  ParticipationStatus,
  SportCategory,
} from '@tandem/domain';
import { apiRequest } from '../../shared/api';

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
  /** Причина отказа по своей отклонённой заявке, если организатор её указал. */
  participationReason: string | null;
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

/** Записаться (подать заявку) или отменить запись; после ответа карточка перечитывается. */
export function useParticipationAction(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ action, answer }: { action: 'join' | 'leave'; answer?: string }) =>
      apiRequest<unknown>(`/events/${encodeURIComponent(id)}/${action}`, {
        method: 'POST',
        body: answer === undefined ? {} : { answer },
      }),
    onSettled: () => client.invalidateQueries({ queryKey: eventCardKey(id) }),
  });
}
