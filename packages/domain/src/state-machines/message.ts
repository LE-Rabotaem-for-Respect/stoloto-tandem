import { defineMachine, reasonRequired } from './machine';

export const MESSAGE_STATUSES = [
  'visible',
  'hidden_by_moderator',
  'deleted_by_moderator',
  'deleted_by_author',
] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const MESSAGE_ACTIONS = ['post', 'hide', 'delete_by_moderator', 'delete_by_author'] as const;
export type MessageAction = (typeof MESSAGE_ACTIONS)[number];

export interface MessageContext {
  /** Причина скрытия или удаления модератором. */
  reason?: string;
}

const deniedMessages: Record<MessageAction, string> = {
  post: 'Сообщение уже опубликовано',
  hide: 'Скрыть можно только видимое сообщение',
  delete_by_moderator: 'Сообщение уже удалено',
  delete_by_author: 'Сообщение уже скрыто или удалено',
};

/** Сообщение обсуждения (ТЗ 4.3, 2.7, 2.10). */
export const messageMachine = defineMachine<MessageStatus, MessageAction, MessageContext>({
  name: 'message',
  rules: [
    { action: 'post', from: [null], to: 'visible' },
    { action: 'hide', from: ['visible'], to: 'hidden_by_moderator', guards: [reasonRequired] },
    {
      action: 'delete_by_moderator',
      from: ['visible', 'hidden_by_moderator'],
      to: 'deleted_by_moderator',
      guards: [reasonRequired],
    },
    { action: 'delete_by_author', from: ['visible'], to: 'deleted_by_author' },
  ],
  denied: (_from, action) => ({ code: 'invalid_transition', message: deniedMessages[action] }),
});
