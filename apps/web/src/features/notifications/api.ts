import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../shared/api';
import { useMe } from '../auth';

export interface NotificationItem {
  id: string;
  type: string;
  icon: string;
  text: string;
  link: string | null;
  createdAt: string;
  read: boolean;
}

export interface NotificationList {
  items: NotificationItem[];
  unread: number;
}

const KEY = ['notifications'] as const;

/** Свои уведомления; пока открыто приложение, обновляются раз в 30 секунд. */
export function useNotifications() {
  const me = useMe();
  return useQuery({
    queryKey: KEY,
    queryFn: () => apiRequest<NotificationList>('/notifications'),
    enabled: Boolean(me.data),
    refetchInterval: 30_000,
  });
}

/**
 * Отмечает прочитанными показанные уведомления — по их id, а не «все»: пришедшее
 * между загрузкой списка и отметкой человек ещё не видел.
 */
export function useMarkRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      apiRequest<{ unread: number }>('/notifications/read', { method: 'POST', body: { ids } }),
    onSuccess: ({ unread }) => {
      client.setQueryData<NotificationList>(KEY, (list) => list && { ...list, unread });
    },
  });
}
