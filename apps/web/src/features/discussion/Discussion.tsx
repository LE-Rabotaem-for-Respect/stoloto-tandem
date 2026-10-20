import { TIME_ZONE } from '@tandem/domain';
import type { Action, ActionCode } from '@tandem/domain';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation } from 'react-router';
import { ApiRequestError } from '../../shared/api';
import { TextAreaField } from '../../shared/ui';
import { loginPath } from '../auth';
import { useDiscussion, useMessageChange } from './api';
import type { MessageChange, MessageView, ThreadView } from './api';
import './discussion.css';

const MESSAGE_MAX_LENGTH = 2000;

const when = new Intl.DateTimeFormat('ru-RU', {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

/** Текст ошибки api для формы: ошибка поля важнее общей. */
function errorText(error: unknown): string | undefined {
  if (!error) return undefined;
  if (!(error instanceof ApiRequestError)) return 'Не получилось. Попробуйте ещё раз';
  return error.fields.text ?? error.fields.parentId ?? error.message;
}

const allowed = (message: MessageView, code: ActionCode) =>
  message.actions.some((action) => action.code === code && action.enabled);

/** Какая форма открыта: ошибка api показывается только у неё. */
type Open =
  | { kind: 'ask' }
  | { kind: 'reply'; threadId: string }
  | { kind: 'edit'; messageId: string }
  | { kind: 'delete'; messageId: string };

interface Controls {
  open: Open | null;
  setOpen: (open: Open | null) => void;
  send: (change: MessageChange) => void;
  error: string | undefined;
  pending: boolean;
}

/** Поле сообщения: вопрос, ответ или правка — с ошибкой api у поля. */
function MessageForm({
  label,
  submitText,
  initial = '',
  controls,
  onSubmit,
  cancellable = true,
}: {
  label: string;
  submitText: string;
  initial?: string;
  controls: Controls;
  onSubmit: (text: string) => void;
  cancellable?: boolean;
}) {
  const [text, setText] = useState(initial);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(text);
  };
  return (
    <form className="discussion-form" onSubmit={submit}>
      <TextAreaField
        label={label}
        value={text}
        rows={3}
        maxLength={MESSAGE_MAX_LENGTH}
        required
        error={controls.error}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="discussion-actions">
        <button className="button" type="submit" disabled={controls.pending}>
          {submitText}
        </button>
        {cancellable && (
          <button className="button" type="button" onClick={() => controls.setOpen(null)}>
            Отмена
          </button>
        )}
      </div>
    </form>
  );
}

/**
 * Сообщение: автор (организация — своим названием), метка «Организатор», время и
 * «изменено»; у скрытого и удалённого — заглушка, автор скрытого видит причину.
 */
function Message({ message, controls }: { message: MessageView; controls: Controls }) {
  const { open, setOpen } = controls;
  const editing = open?.kind === 'edit' && open.messageId === message.id;
  const deleting = open?.kind === 'delete' && open.messageId === message.id;
  return (
    <article className="message" aria-label={`Сообщение: ${message.author.name}`}>
      <p className="message-meta">
        <span className="message-author">{message.author.name}</span>
        {message.isOrganizer && <span className="message-organizer">Организатор</span>}
        <time dateTime={message.createdAt}>{when.format(new Date(message.createdAt))}</time>
        {message.edited && <span>изменено</span>}
      </p>
      {message.text === null ? (
        <p className="message-placeholder">
          {message.placeholder}
          {message.moderationReason && `. Причина: ${message.moderationReason}`}
        </p>
      ) : editing ? (
        <MessageForm
          label="Изменить сообщение"
          submitText="Сохранить"
          initial={message.text}
          controls={controls}
          onSubmit={(text) => controls.send({ kind: 'edit', id: message.id, text })}
        />
      ) : (
        <p className="message-text">{message.text}</p>
      )}
      {deleting && (
        <div className="discussion-confirm">
          <p>Удалить сообщение? Вместо него останется «Сообщение удалено автором».</p>
          {controls.error && (
            <p className="form-error" role="alert">
              {controls.error}
            </p>
          )}
          <div className="discussion-actions">
            <button
              className="button"
              type="button"
              disabled={controls.pending}
              onClick={() => controls.send({ kind: 'remove', id: message.id })}
            >
              Удалить
            </button>
            <button className="button" type="button" onClick={() => setOpen(null)}>
              Отмена
            </button>
          </div>
        </div>
      )}
      {!editing && !deleting && (
        <div className="discussion-actions">
          {allowed(message, 'edit_message') && (
            <button
              className="button"
              type="button"
              onClick={() => setOpen({ kind: 'edit', messageId: message.id })}
            >
              Изменить
            </button>
          )}
          {allowed(message, 'delete_message') && (
            <button
              className="button"
              type="button"
              onClick={() => setOpen({ kind: 'delete', messageId: message.id })}
            >
              Удалить
            </button>
          )}
        </div>
      )}
    </article>
  );
}

/** Вопрос и ответы на него; ответить можно на видимое сообщение верхнего уровня. */
function Thread({
  thread,
  canPost,
  controls,
}: {
  thread: ThreadView;
  canPost: boolean;
  controls: Controls;
}) {
  const replying = controls.open?.kind === 'reply' && controls.open.threadId === thread.id;
  return (
    <li className="thread">
      <Message message={thread} controls={controls} />
      {thread.replies.length > 0 && (
        <ul className="thread-replies" aria-label={`Ответы: ${thread.author.name}`}>
          {thread.replies.map((reply) => (
            <li key={reply.id}>
              <Message message={reply} controls={controls} />
            </li>
          ))}
        </ul>
      )}
      {canPost &&
        thread.status === 'visible' &&
        (replying ? (
          <MessageForm
            label={`Ответ: ${thread.author.name}`}
            submitText="Ответить"
            controls={controls}
            onSubmit={(text) => controls.send({ kind: 'post', text, parentId: thread.id })}
          />
        ) : (
          <div className="discussion-actions">
            <button
              className="button"
              type="button"
              onClick={() => controls.setOpen({ kind: 'reply', threadId: thread.id })}
            >
              Ответить
            </button>
          </div>
        ))}
    </li>
  );
}

/**
 * Обсуждение мероприятия (ТЗ 2.7): читают все, кому видна карточка, в том числе гость;
 * писать — по `post_message` из `actions[]` карточки, гостю — вход с возвратом к карточке.
 * Сообщения загружаются при открытии карточки и подгружаются каждые 30 секунд.
 */
export function Discussion({ eventId, post }: { eventId: string; post: Action | undefined }) {
  const discussion = useDiscussion(eventId);
  const change = useMessageChange(eventId);
  const location = useLocation();
  const [open, setOpenState] = useState<Open | null>(null);
  // Форма вопроса после отправки очищается: новый ключ — новое пустое поле
  const [askKey, setAskKey] = useState(0);

  const controls: Controls = {
    open,
    setOpen: (next) => {
      change.reset();
      setOpenState(next);
    },
    send: (body) =>
      change.mutate(body, {
        onSuccess: () => {
          setOpenState(null);
          if (body.kind === 'post' && !body.parentId) setAskKey((key) => key + 1);
        },
      }),
    error: errorText(change.error),
    pending: change.isPending,
  };
  const askControls: Controls = {
    ...controls,
    error: open?.kind === 'ask' ? controls.error : undefined,
  };
  const canPost = post?.enabled === true;

  return (
    <section id="discussion" className="event-card-section" aria-labelledby="discussion-title">
      <h2 id="discussion-title">Обсуждение</h2>
      {discussion.isPending && <p role="status">Загрузка…</p>}
      {/* Обсуждение — второстепенный блок: его сбой не объявляется поверх статуса карточки */}
      {discussion.error && (
        <p className="event-card-soon">Не удалось загрузить обсуждение. Обновите страницу</p>
      )}
      {discussion.data?.length === 0 && <p className="event-card-soon">Вопросов пока нет.</p>}
      {discussion.data && discussion.data.length > 0 && (
        <ul className="discussion">
          {discussion.data.map((thread) => (
            <Thread
              key={thread.id}
              thread={thread}
              canPost={canPost}
              controls={open?.kind === 'ask' ? { ...controls, error: undefined } : controls}
            />
          ))}
        </ul>
      )}
      {post?.requiresAuth && (
        <p>
          <Link className="button" to={loginPath(location.pathname + location.search)}>
            Войти, чтобы задать вопрос
          </Link>
        </p>
      )}
      {canPost && (
        <MessageForm
          key={askKey}
          label="Ваш вопрос организатору и участникам"
          submitText="Отправить"
          controls={askControls}
          cancellable={false}
          onSubmit={(text) => {
            setOpenState({ kind: 'ask' });
            change.mutate(
              { kind: 'post', text },
              {
                onSuccess: () => {
                  setOpenState(null);
                  setAskKey((key) => key + 1);
                },
              },
            );
          }}
        />
      )}
      {post && !canPost && !post.requiresAuth && (
        <p className="event-card-soon">Написать нельзя: {post.reason}</p>
      )}
    </section>
  );
}
