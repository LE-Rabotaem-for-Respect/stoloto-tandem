import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../shared/api';
import { CLOCK_KEY } from '../../shared/clock';
import { ME_KEY } from '../auth';

/** Только то, что нужно панели для «Завершить это событие». */
interface EventTimes {
  id: string;
  endsAt: string;
}

export function useEventTimes(id: string | undefined) {
  return useQuery({
    queryKey: ['events', id],
    queryFn: () => apiRequest<EventTimes>(`/events/${encodeURIComponent(id ?? '')}`),
    enabled: id !== undefined,
  });
}

/**
 * Перемотка часов стенда. После неё любые данные с датами устарели («Идёт»,
 * «Завершено», «Сегодня»), поэтому кеш запросов перечитывается целиком.
 */
export function useShiftClock() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (addSeconds: number) =>
      apiRequest<{ now: string }>('/demo/clock', { method: 'POST', body: { addSeconds } }),
    onSuccess: () => client.invalidateQueries(),
  });
}

/** «Сбросить демо-данные»: стираются все данные стенда, в том числе сессии входа. */
export function useResetDemo() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<{ lastResetAt: string }>('/demo/reset', { method: 'POST' }),
    onSuccess: async () => {
      // Сессии стёрты: текущий пользователь — гость; остальные данные стенда — заново
      client.setQueryData(ME_KEY, null);
      // resetQueries, а не removeQueries: открытые экраны сразу перечитают свои данные
      await client.resetQueries({
        predicate: ({ queryKey: [key] }) => key !== CLOCK_KEY[0] && key !== ME_KEY[0],
      });
      await client.invalidateQueries({ queryKey: CLOCK_KEY });
    },
  });
}
