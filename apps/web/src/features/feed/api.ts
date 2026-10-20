import { useInfiniteQuery } from '@tanstack/react-query';
import type { EventDisplayStatus, EventLevel, SportCategory } from '@tandem/domain';
import { apiRequest } from '../../shared/api';
import { feedQuery } from './filters';
import type { FeedFilters } from './filters';

/** Строка ленты (`GET /events`): только то, что помещается в карточку ленты. */
export interface FeedItem {
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
}

export interface FeedPage {
  items: FeedItem[];
  total: number;
  limit: number;
  offset: number;
}

export const FEED_PAGE_SIZE = 20;

/** Лента страницами по 20: «Показать ещё» догружает следующую. */
export function useFeed(filters: FeedFilters) {
  const params = feedQuery(filters);
  params.set('limit', String(FEED_PAGE_SIZE));
  return useInfiniteQuery({
    queryKey: ['feed', params.toString()],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const page = new URLSearchParams(params);
      page.set('offset', String(pageParam));
      return apiRequest<FeedPage>(`/events?${page.toString()}`);
    },
    getNextPageParam: (last) =>
      last.offset + last.items.length < last.total ? last.offset + last.items.length : undefined,
  });
}
