import { TIME_ZONE } from '@tandem/domain';
import type { Action } from '@tandem/domain';
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

const fieldError = (error: unknown) =>
  error instanceof ApiRequestError ? (error.fields.text ?? error.fields.parentId) : undefined;
const formError = (error: unknown) => {
  if (!error || fieldError(error)) return undefined;
  return error instanceof ApiRequestError ? error.message : 'Не получилось. Попробуйте ещё раз';
};

const can = (message: MessageView, code: Action['code']) =>
  message.actions.some((action) => action.code === code && action.enabled);

/** Поле сообщения: вопрос, ответ или правка — с ошибкой api у поля. */
function MessageForm({
  label,
  submitText,
  initial = '',
  onSubmit,
  onCancel,
}: {
  label: string;
  submitText: string;
  initial?: string;
  onSubmit: (text: string, done: () => void) => void;
  onCancel?: () => void;
}) {
  const [text, setText] = useState(initial);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(text, () => setText(''));
  };
  return (
    <form className="discussion-form" onSubmit={submit}>
      <MessageFormBody label={label} text={text} onText={setText} />
      <div className="discussion-actions">
        <button className="button" type="submit">
          {submitText}
        </button>
        {onCancel && (
          <button className="button" type="button" onClick={onCancel}>
            Отмена
          </button>
        )}
      </div>
    </form>
  );
}

function MessageFormBody({
  label,
  text,
  onText,
}: {
  label: string;
  text: string;
  onText: (text: string) => void;
}) {
  return (
    <TextAreaField
      label={label}
      value={text}
      rows={3}
      maxLength={MESSAGE_MAX_LENGTH}
      required
      onChange={(event) => onText(event.target.value)}
    />
  );
}

/**
 * Сообщение: автор (организация — своим названием), метка «Организатор», время и
 * «изменено»; у скрытого и удалённого — заглушка, автор скрытого видит причину.
 */
function Message({
  message,
  send,
  error,
  pending,
}: {
  message: MessageView;
  send: (change: MessageChange, done?: () => void) => void;
  error: unknown;
  pending: boolean;
}) {
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view');
  const errorHere = mode !== 'view' ? error : undefined;
  return (
    <article className="message" aria-label={`Сообщение: ${message.author.name}`}>
      <p className="message-meta">
        <span className="message-author">{message.author.name}</span>
        {message.isOrganizer && <span className="message-organizer">Организатор</span>}
        <time dateTime={message.createdAt}>{when.format(new Date(message.createdAt))}</time>
        {message.edited && <span className="message-edited">изменено</span>}
      </p>
      {message.text !== null ? (
        mode === 'edit' ? (
          <MessageForm
            label="Изменить сообщение"
            submitText="Сохранить"
            initial={message.text}
            onSubmit={(text) =>
              send({ kind: 'edit', id: message.id, text }, () => setMode('view'))
            }
            onCancel={() => setMode('view')}
          />
        ) : (
          <p className="message-text">{message.text}</p>
        )
      ) : (
        <p className="message-placeholder">
          {message.placeholder}
          {message.moderationReason && `. Причина: ${message.moderationReason}`}
        </p>
      )}
      {mode === 'delete' && (
        <div className="discussion-confirm">
          <p>Удалить сообщение? Вместо него останется «Сообщение удалено автором».</p>
          <div className="discussion-actions">
            <button
              className="button"
              type="button"
              disabled={pending}
              onClick={() => send({ kind: 'remove', id: message.id }, () => setMode('view'))}
            >
              Удалить
            </button>
            <button className="button" type="button" onClick={() => setMode('view')}>
              Отмена
            </button>
          </div>
        </div>
      )}
      {errorHere !== undefined && fieldError(errorHere) && (
        <p className="field-error" role="alert">
          {fieldError(errorHere)}
        </p>
      )}
      {errorHere !== undefined && formError(errorHere) && (
        <p className="form-error" role="alert">
          {formError(errorHere)}
        </p>
      )}
      {mode === 'view' && (can(message, 'edit_message') || can(message, 'delete_message')) && (
        <div className="discussion-actions">
          {can(message, 'edit_message') && (
            <button className="button" type="button" onClick={() => setMode('edit')}>
              Изменить
            </button>
          )}
          {can(message, 'delete_message') && (
            <button className="button" type="button" onClick={() => setMode('delete')}>
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
  send,
  error,
  pending,
  active,
  setActive,
}: {
  thread: ThreadView;
  canPost: boolean;
  send: (change: MessageChange, done?: () => void) => void;
  error: unknown;
  pending: boolean;
  active: string | null;
  setActive: (key: string | null) => void;
}) {
  const replying = active === `reply:${thread.id}`;
  return (
    <li className="thread">
      <Message message={thread} send={send} error={error} pending={pending} />
      {thread.replies.length > 0 && (
        <ul className="thread-replies" aria-label="Ответы">
          {thread.replies.map((reply) => (
            <li key={reply.id}>
              <Message message={reply} send={send} error={error} pending={pending} />
            </li>
          ))}
        </ul>
      )}
      {canPost && thread.status === 'visible' && (
        <div className="thread-reply">
          {replying ? (
            <>
              <MessageForm
                label={`Ответ: ${thread.author.name}`}
                submitText="Ответить"
                onSubmit={(text) =>
                  send({ kind: 'post', text, parentId: thread.id }, () => setActive(null))
                }
                onCancel={() => setActive(null)}
              />
              {fieldError(error) && (
                <p className="field-error" role="alert">
                  {fieldError(error)}
                </p>
              )}
            </>
          ) : (
            <button className="button" type="button" onClick={() => setActive(`reply:${thread.id}`)}>
              Ответить
            </button>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Обсуждение мероприятия (ТЗ 2.7): читают все, кому видна карточка, в том числе гость;
 * писать — по `post_message` из `actions[]` карточки. Гостю — вход с возвратом к карточке.
 * Новые сообщения подгружаются при открытии карточки и каждые 30 секунд.
 */
export function Discussion({ eventId, post }: { eventId: string; post: Action | undefined }) {
  const discussion = useDiscussion(eventId);
  const change = useMessageChange(eventId);
  const location = useLocation();
  // Какая форма открыта: ошибка api показывается только у неё
  const [active, setActive] = useState<string | null>(null);
  const canPost = post?.enabled === true;

  const send = (body: MessageChange, done?: () => void) => {
    change.mutate(body, { onSuccess: () => done?.() });
  };
  const askError = active === 'ask' ? change.error : undefined;

  return (
    <section id="discussion" className="event-card-section" aria-labelledby="discussion-title">
      <h2 id="discussion-title">Обсуждение</h2>
      {discussion.isPending && <p role="status">Загрузка…</p>}
      {discussion.error && (
        <p role="alert">Не удалось загрузить обсуждение. Попробуйте обновить страницу</p>
      )}
      {discussion.data?.length === 0 && (
        <p className="event-card-soon">Вопросов пока нет — задайте первый.</p>
      )}
      {discussion.data && discussion.data.length > 0 && (
        <ul className="discussion">
          {discussion.data.map((thread) => (
            <Thread
              key={thread.id}
              thread={thread}
              canPost={canPost}
              send={(body, done) => {
                setActive((current) => current ?? `message:${thread.id}`);
                send(body, done);
              }}
              error={active?.endsWith(thread.id) ? change.error : undefined}
              pending={change.isPending}
              active={active}
              setActive={(key) => {
                change.reset();
                setActive(key);
              }}
            />
          ))}
        </ul>
      )}
      {post?.requiresAuth ? (
        <p>
          <Link className="button" to={loginPath(location.pathname + location.search)}>
            Войти, чтобы задать вопрос
          </Link>
        </p>
      ) : canPost ? (
        <div onFocus={() => active !== 'ask' && (change.reset(), setActive('ask'))}>
          <MessageForm
            label="Ваш вопрос организатору и участникам"
            submitText="Отправить"
            onSubmit={(text, done) => {
              setActive('ask');
              send({ kind: 'post', text }, done);
            }}
          />
          {askError !== undefined && (fieldError(askError) ?? formError(askError)) && (
            <p className="field-error" role="alert">
              {fieldError(askError) ?? formError(askError)}
            </p>
          )}
        </div>
      ) : (
        post && <p className="event-card-soon">Написать нельзя: {post.reason}</p>
      )}
    </section>
  );
}
