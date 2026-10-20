import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Action, MessageStatus } from '@tandem/domain';
import { apiRequest } from '../../shared/api';

/** Сообщение обсуждения (`GET /events/:id/messages`): время — строками ISO. */
export interface MessageView {
  id: string;
  parentId: string | null;
  /** Сообщение организации подписано её названием (ТЗ 2.7). */
  author: { kind: 'user' | 'organization'; id: string; name: string };
  isOrganizer: boolean;
  /** Текст — только у видимого; у скрытого и удалённого — заглушка в `placeholder`. */
  text: string | null;
  placeholder: string | null;
  status: MessageStatus;
  /** Причина скрытия — только автору. */
  moderationReason: string | null;
  createdAt: string;
  edited: boolean;
  actions: Action[];
}

export interface ThreadView extends MessageView {
  replies: MessageView[];
}

/** Как часто подгружать новые сообщения, пока карточка открыта (ТЗ 2.7). */
export const DISCUSSION_REFRESH_MS = 30_000;

const discussionKey = (eventId: string) => ['discussion', eventId] as const;
const path = (eventId: string) => `/events/${encodeURIComponent(eventId)}/messages`;

export function useDiscussion(eventId: string) {
  return useQuery({
    queryKey: discussionKey(eventId),
    queryFn: () => apiRequest<ThreadView[]>(path(eventId)),
    refetchInterval: DISCUSSION_REFRESH_MS,
  });
}

export type MessageChange =
  | { kind: 'post'; text: string; parentId?: string }
  | { kind: 'edit'; id: string; text: string }
  | { kind: 'remove'; id: string };

/** Новое сообщение, правка и удаление своего; после ответа обсуждение перечитывается. */
export function useMessageChange(eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (change: MessageChange) => {
      if (change.kind === 'post') {
        return apiRequest<MessageView>(path(eventId), {
          method: 'POST',
          body: { text: change.text, ...(change.parentId && { parentId: change.parentId }) },
        });
      }
      const url = `${path(eventId)}/${encodeURIComponent(change.id)}`;
      return change.kind === 'edit'
        ? apiRequest<MessageView>(url, { method: 'PATCH', body: { text: change.text } })
        : apiRequest<MessageView>(url, { method: 'DELETE' });
    },
    onSettled: () => client.invalidateQueries({ queryKey: discussionKey(eventId) }),
  });
}
