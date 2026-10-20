import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SportCategory } from '@tandem/domain';
import { apiRequest } from '../../shared/api';

export interface SportItem {
  id: string;
  name: string;
  category: SportCategory;
  isCustom: boolean;
}

export interface SportSearchResult {
  items: SportItem[];
  /** Запрос совпал с направлением каталога — «Добавить как новое» не нужно. */
  exactMatch: boolean;
}

/** Подсказки направлений для автодополнения (`GET /sports?q`). */
export function useSportSuggestions(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ['sports', q],
    queryFn: () => apiRequest<SportSearchResult>(`/sports?q=${encodeURIComponent(q)}&limit=8`),
    enabled: q.length > 0,
    staleTime: 60_000,
  });
}

/** Ответ `POST /events` — карточка; форме нужен только id для перехода. */
export interface CreatedEvent {
  id: string;
}

export function useCreateEvent() {
  return useMutation({
    mutationFn: (body: object) => apiRequest<CreatedEvent>('/events', { method: 'POST', body }),
  });
}

/** Изменение после публикации (`PATCH /events/:id`); карточка после ответа перечитывается. */
export function useUpdateEvent(eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: object) =>
      apiRequest<CreatedEvent>(`/events/${encodeURIComponent(eventId)}`, {
        method: 'PATCH',
        body,
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['event', eventId] }),
  });
}
