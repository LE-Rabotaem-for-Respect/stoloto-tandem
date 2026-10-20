import type {
  EventDisplayStatus,
  EventLevel,
  ParticipationGroup,
  ParticipationStatus,
  SportCategory,
} from '@tandem/domain';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../shared/api';
import { useMe } from '../auth';

/** Запись из `GET /me/participations`: мероприятие строкой ленты и группа раздела. */
export interface MyParticipation {
  id: string;
  status: ParticipationStatus;
  decisionReason: string | null;
  waitlistPosition: number | null;
  group: ParticipationGroup;
  event: {
    id: string;
    title: string;
    sport: { id: string; name: string; category: SportCategory; isCustom: boolean };
    organizer: { kind: 'user' | 'organization'; id: string; name: string };
    startsAt: string;
    endsAt: string;
    city: string;
    area: string;
    mode: 'free' | 'approval';
    level: EventLevel;
    displayStatus: EventDisplayStatus;
  };
}

/** Свои записи; запрос — только вошедшему. */
export function useMyParticipations() {
  const me = useMe();
  return useQuery({
    queryKey: ['me', 'participations'],
    queryFn: () => apiRequest<{ items: MyParticipation[] }>('/me/participations'),
    enabled: Boolean(me.data),
  });
}
