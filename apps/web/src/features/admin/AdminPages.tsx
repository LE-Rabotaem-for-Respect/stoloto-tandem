import {
  EVENT_STATUSES,
  ORGANIZATION_STATUSES,
  ORGANIZATION_STATUS_VIEW,
  SPORT_CATEGORIES,
  SPORT_CATEGORY_TITLES,
  SPORT_NAME_MAX_LENGTH,
} from '@tandem/domain';
import type {
  ActionCode,
  EventStatus,
  OrganizationStatus,
  SportCategory,
  StatusTone,
} from '@tandem/domain';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { IconName } from '../../shared/illustrations';
import { ApiRequestError } from '../../shared/api';
import { Icon } from '../../shared/ui/Icon';
import { RequireAuth, useMe } from '../auth';
import {
  useAdminEvents,
  useAdminHiddenMessages,
  useAdminOrganizations,
  useAdminOverview,
  useAdminSports,
  useDiscussion,
  useEventModeration,
  useOrganizationDecision,
  useSportChange,
  useSportSuggestions,
} from './api';
import type {
  AdminEvent,
  AdminHiddenMessage,
  AdminOrganization,
  AdminSearch,
  AdminSport,
  EventModerationBody,
  Page,
  SportChange,
} from './api';
import './admin.css';

interface StatusLook {
  text: string;
  icon: IconName;
  tone: StatusTone;
}

const EVENT_STATUS_ADMIN: Record<EventStatus, StatusLook> = {
  published: { text: 'Опубликовано', icon: 'status-confirmed', tone: 'ok' },
  cancelled: { text: 'Отменено организатором', icon: 'status-event-cancelled', tone: 'bad' },
  unpublished: { text: 'Снято с публикации', icon: 'action-hide', tone: 'off' },
  deleted: { text: 'Удалено', icon: 'action-delete', tone: 'off' },
};

// Подписи статусов организации — из @tandem/domain; кроме черновика: «Заполните профиль»
// обращено к самой организации, администратору нужен статус
const ORGANIZATION_STATUS_ADMIN: Record<OrganizationStatus, StatusLook> = {
  ...(ORGANIZATION_STATUS_VIEW as Record<OrganizationStatus, StatusLook>),
  draft: { ...(ORGANIZATION_STATUS_VIEW.draft as StatusLook), text: 'Черновик' },
};

/** Статус — текстом, пиктограммой и цветом (ТЗ 2.1, П4). */
function StatusTag({ text, icon, tone }: StatusLook) {
  return (
    <span
      className="admin-status"
      style={{ color: `var(--status-${tone}-fg)`, background: `var(--status-${tone}-bg)` }}
    >
      <Icon name={icon} />
      {text}
    </span>
  );
}

const dateTime = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Asia/Krasnoyarsk',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

/** Раздел только администратору: остальным — объяснение, а не пустая страница. */
function AdminOnly({ children }: { children: ReactNode }) {
  const me = useMe();
  return (
    <RequireAuth>
      {me.data?.role === 'admin' ? (
        children
      ) : (
        <div className="page">
          <h1>Админка</h1>
          <p>Раздел доступен только администратору.</p>
        </div>
      )}
    </RequireAuth>
  );
}

function AdminNav() {
  return (
    <nav className="admin-nav" aria-label="Разделы админки">
      <Link to="/admin">Обзор</Link>
      <Link to="/admin/organizations">Организации</Link>
      <Link to="/admin/events">Мероприятия</Link>
      <Link to="/admin/messages">Скрытые сообщения</Link>
      <Link to="/admin/sports">Направления</Link>
    </nav>
  );
}

function errorText(error: unknown): string {
  return error instanceof ApiRequestError ? error.message : 'Не удалось загрузить данные';
}

function Loading({ error, isPending }: { error: unknown; isPending: boolean }) {
  if (isPending) return <p role="status">Загрузка…</p>;
  if (error) return <p role="alert">{errorText(error)}</p>;
  return null;
}

interface Tile {
  title: string;
  value: number;
  to: string;
  icon: IconName;
  /** Тон «ждёт» — когда есть что разбирать. */
  waiting: boolean;
}

function Overview() {
  const overview = useAdminOverview();
  const data = overview.data;
  const tiles: Tile[] | undefined = data && [
    {
      title: 'Заявки организаций ждут решения',
      value: data.pendingOrganizations,
      to: '/admin/organizations?status=pending',
      icon: 'status-pending',
      waiting: data.pendingOrganizations > 0,
    },
    {
      title: 'События сняты за неделю',
      value: data.unpublishedEventsLastWeek,
      to: '/admin/events?status=unpublished&period=week',
      icon: 'action-hide',
      waiting: false,
    },
    {
      title: 'Скрытые сообщения',
      value: data.hiddenMessages,
      to: '/admin/messages',
      icon: 'action-message',
      waiting: false,
    },
  ];
  return (
    <div className="page">
      <h1>Админка</h1>
      <AdminNav />
      <Loading error={overview.error} isPending={overview.isPending} />
      {tiles && (
        <ul className="admin-tiles" aria-label="Обзор">
          {tiles.map((tile) => (
            <li key={tile.title}>
              <Link
                className={tile.waiting ? 'admin-tile admin-tile--wait' : 'admin-tile'}
                to={tile.to}
                aria-label={`${tile.title}: ${tile.value}`}
              >
                <span className="admin-tile-head" aria-hidden="true">
                  <Icon name={tile.icon} />
                  <span className="admin-tile-value">{tile.value}</span>
                </span>
                <span aria-hidden="true">{tile.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Поиск по тексту и статусу; значения — в адресе, чтобы плитки обзора вели сразу в список. */
function SearchForm({
  statuses,
  label,
}: {
  statuses: readonly { value: string; text: string }[];
  label: string;
}) {
  const [params, setParams] = useSearchParams();
  const id = useId();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = new URLSearchParams(params);
    for (const key of ['q', 'status'] as const) {
      const value = String(data.get(key) ?? '').trim();
      if (value) next.set(key, value);
      else next.delete(key);
    }
    // Новый поиск — с первой страницы; «за неделю» и одна организация — только для перехода
    next.delete('offset');
    next.delete('period');
    next.delete('id');
    setParams(next);
  };
  // key — адрес: переход по меню или плитке подставляет в поля новые значения
  return (
    <form
      key={params.toString()}
      className="admin-search"
      role="search"
      aria-label={label}
      onSubmit={submit}
    >
      <div className="field">
        <label htmlFor={`${id}-q`}>Название</label>
        <input id={`${id}-q`} name="q" defaultValue={params.get('q') ?? ''} maxLength={100} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-status`}>Статус</label>
        <select id={`${id}-status`} name="status" defaultValue={params.get('status') ?? ''}>
          <option value="">Любой</option>
          {statuses.map((status) => (
            <option key={status.value} value={status.value}>
              {status.text}
            </option>
          ))}
        </select>
      </div>
      <button className="button" type="submit">
        Найти
      </button>
    </form>
  );
}

function useSearch(): AdminSearch {
  const [params] = useSearchParams();
  return {
    id: params.get('id') ?? undefined,
    q: params.get('q') ?? undefined,
    status: params.get('status') ?? undefined,
    organizationId: params.get('organizationId') ?? undefined,
    period: params.get('period') ?? undefined,
    offset: params.get('offset') ?? undefined,
  };
}

/** «Найдено» и переход между страницами по 20 строк (смещение — в адресе). */
function Pager({ page }: { page: Page<unknown> }) {
  const [params, setParams] = useSearchParams();
  const go = (offset: number) => {
    const next = new URLSearchParams(params);
    if (offset > 0) next.set('offset', String(offset));
    else next.delete('offset');
    setParams(next);
  };
  const from = page.total === 0 ? 0 : page.offset + 1;
  const to = Math.min(page.offset + page.items.length, page.total);
  return (
    <div className="admin-pager">
      <p role="status">
        Найдено: {page.total}
        {page.total > page.limit && `, показаны ${from}–${to}`}
      </p>
      {page.total > page.limit && (
        <div className="admin-actions">
          <button
            className="button"
            type="button"
            disabled={page.offset === 0}
            onClick={() => go(Math.max(0, page.offset - page.limit))}
          >
            Назад
          </button>
          <button
            className="button"
            type="button"
            disabled={page.offset + page.limit >= page.total}
            onClick={() => go(page.offset + page.limit)}
          >
            Дальше
          </button>
        </div>
      )}
    </div>
  );
}

/** «Одобрить» сразу, «Отклонить» — только с причиной: её увидит организация. */
function Decision({ organization }: { organization: AdminOrganization }) {
  const decide = useOrganizationDecision();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const id = useId();
  const fieldError =
    decide.error instanceof ApiRequestError ? decide.error.fields.reason : undefined;
  const formError = decide.error && !fieldError ? errorText(decide.error) : undefined;

  if (rejecting) {
    return (
      <form
        className="admin-decision"
        onSubmit={(event) => {
          event.preventDefault();
          decide.mutate({ id: organization.id, decision: 'reject', reason });
        }}
      >
        <div className="field">
          <label htmlFor={`${id}-reason`}>Причина отказа — её увидит организация</label>
          <textarea
            id={`${id}-reason`}
            value={reason}
            maxLength={500}
            required
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? `${id}-reason-error` : undefined}
            onChange={(event) => setReason(event.target.value)}
          />
          {fieldError && (
            <p className="field-error" id={`${id}-reason-error`}>
              {fieldError}
            </p>
          )}
        </div>
        {formError && <p className="form-error">{formError}</p>}
        <div className="admin-actions">
          <button className="button" type="submit" disabled={decide.isPending}>
            Отклонить с этой причиной
          </button>
          <button className="button" type="button" onClick={() => setRejecting(false)}>
            Отмена
          </button>
        </div>
      </form>
    );
  }
  return (
    <div className="admin-actions">
      <button
        className="button button-primary"
        type="button"
        disabled={decide.isPending}
        onClick={() => decide.mutate({ id: organization.id, decision: 'approve' })}
      >
        Одобрить
      </button>
      <button className="button" type="button" onClick={() => setRejecting(true)}>
        Отклонить
      </button>
      {formError && <p className="form-error">{formError}</p>}
    </div>
  );
}

function OrganizationRow({ organization }: { organization: AdminOrganization }) {
  return (
    <li className="admin-row">
      <div className="admin-row-head">
        <h2>{organization.name}</h2>
        <StatusTag {...ORGANIZATION_STATUS_ADMIN[organization.status]} />
      </div>
      <dl className="facts admin-facts">
        <dt>Представитель</dt>
        <dd>
          {organization.representativeName}, {organization.representativeRole}
        </dd>
        <dt>Город</dt>
        <dd>{organization.city || '—'}</dd>
        <dt>Контакты</dt>
        <dd>{organization.contacts || '—'}</dd>
        <dt>Направления</dt>
        <dd>{organization.sports.map((sport) => sport.name).join(', ') || '—'}</dd>
        {organization.submittedAt && (
          <>
            <dt>Отправлена</dt>
            <dd>{dateTime.format(new Date(organization.submittedAt))}</dd>
          </>
        )}
        {organization.decisionReason && (
          <>
            <dt>Причина решения</dt>
            <dd>{organization.decisionReason}</dd>
          </>
        )}
      </dl>
      <p>{organization.description}</p>
      <Link className="admin-link" to={`/admin/events?organizationId=${organization.id}`}>
        Мероприятия организации
      </Link>
      {organization.actions.some(
        (action) => action.code === 'review_organization' && action.enabled,
      ) && <Decision organization={organization} />}
    </li>
  );
}

const ORGANIZATION_FILTERS = ORGANIZATION_STATUSES.map((status) => ({
  value: status,
  text: ORGANIZATION_STATUS_ADMIN[status].text,
}));

function Organizations() {
  const search = useSearch();
  const list = useAdminOrganizations(search);
  return (
    <div className="page">
      <h1>Организации</h1>
      <AdminNav />
      <SearchForm statuses={ORGANIZATION_FILTERS} label="Поиск организаций" />
      {search.id && (
        <p>
          Одна организация.{' '}
          <Link className="admin-link" to="/admin/organizations">
            Показать все
          </Link>
        </p>
      )}
      <Loading error={list.error} isPending={list.isPending} />
      {list.data && (
        <>
          <Pager page={list.data} />
          <ul className="admin-list">
            {list.data.items.map((organization) => (
              <OrganizationRow key={organization.id} organization={organization} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Обсуждение мероприятия прямо в строке: экран карточки делается отдельно. */
function Discussion({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);
  const discussion = useDiscussion(eventId, open);
  const id = useId();
  return (
    <div className="admin-discussion">
      <button
        className="button"
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-messages`}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? 'Скрыть обсуждение' : 'Обсуждение'}
      </button>
      {open && (
        <div id={`${id}-messages`}>
          <Loading error={discussion.error} isPending={discussion.isPending} />
          {discussion.data?.length === 0 && <p>Сообщений нет.</p>}
          {discussion.data && discussion.data.length > 0 && (
            <ul className="admin-messages">
              {discussion.data.map((thread) => (
                <li key={thread.id}>
                  <p>
                    <strong>{thread.author.name}</strong>
                    {thread.isOrganizer && ' (организатор)'}: {thread.text ?? thread.placeholder}
                  </p>
                  {thread.replies.length > 0 && (
                    <ul>
                      {thread.replies.map((reply) => (
                        <li key={reply.id}>
                          <strong>{reply.author.name}</strong>
                          {reply.isOrganizer && ' (организатор)'}: {reply.text ?? reply.placeholder}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

type ModerationAction = EventModerationBody['action'];

const MODERATION_TEXT: Record<ModerationAction, { button: string; submit: string }> = {
  unpublish: { button: 'Снять с публикации', submit: 'Снять с этой причиной' },
  delete: { button: 'Удалить', submit: 'Удалить с этой причиной' },
};

// Код в `actions[]` строки → действие запроса модерации
const MODERATION_CODE: Record<ModerationAction, ActionCode> = {
  unpublish: 'unpublish_event',
  delete: 'delete_event',
};

/**
 * «Снять с публикации» и «Удалить» (ТЗ 2.10) — только с причиной: её увидят организатор и
 * записавшиеся. Кнопки — по `actions[]` строки: интерфейс сам права не проверяет (DECISION-002).
 */
function Moderation({ event }: { event: AdminEvent }) {
  const moderate = useEventModeration();
  const [action, setAction] = useState<ModerationAction | null>(null);
  const [reason, setReason] = useState('');
  // Кнопка заменяется формой и обратно: фокус — на поле причины, после «Отмены» и решения —
  // на кнопку действия (или первую оставшуюся), а не на body
  const [returnTo, setReturnTo] = useState<ModerationAction | null>(null);
  const reasonField = useRef<HTMLTextAreaElement>(null);
  const buttons = useRef<HTMLDivElement>(null);
  const close = () => {
    setReturnTo(action);
    setAction(null);
  };
  const id = useId();
  const available = (['unpublish', 'delete'] as const).filter((code) =>
    event.actions.some((item) => item.code === MODERATION_CODE[code] && item.enabled),
  );
  // После решения строка перезагружается и кнопка может исчезнуть: тогда фокус — на оставшейся
  const shown = available.join();
  useEffect(() => {
    if (action) {
      reasonField.current?.focus();
      return;
    }
    const lost = document.activeElement === document.body;
    if (!returnTo || !(lost || buttons.current?.contains(document.activeElement))) return;
    const own = buttons.current?.querySelector<HTMLButtonElement>(`[data-action="${returnTo}"]`);
    (own ?? buttons.current?.querySelector('button'))?.focus();
  }, [action, returnTo, shown]);
  const fieldError =
    moderate.error instanceof ApiRequestError ? moderate.error.fields.reason : undefined;
  const formError = moderate.error && !fieldError ? errorText(moderate.error) : undefined;

  if (available.length === 0) return null;
  if (action) {
    return (
      <form
        className="admin-decision"
        onSubmit={(submit) => {
          submit.preventDefault();
          moderate.mutate(
            { id: event.id, action, reason },
            {
              onSuccess: () => {
                close();
                setReason('');
              },
            },
          );
        }}
      >
        <div className="field">
          <label htmlFor={`${id}-reason`}>Причина — её увидят организатор и записавшиеся</label>
          <textarea
            ref={reasonField}
            id={`${id}-reason`}
            value={reason}
            maxLength={500}
            required
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? `${id}-reason-error` : undefined}
            onChange={(change) => setReason(change.target.value)}
          />
          {fieldError && (
            <p className="field-error" id={`${id}-reason-error`}>
              {fieldError}
            </p>
          )}
        </div>
        {formError && <p className="form-error">{formError}</p>}
        <div className="admin-actions">
          <button className="button" type="submit" disabled={moderate.isPending}>
            {MODERATION_TEXT[action].submit}
          </button>
          <button
            className="button"
            type="button"
            onClick={() => {
              close();
              moderate.reset();
            }}
          >
            Отмена
          </button>
        </div>
      </form>
    );
  }
  return (
    <div className="admin-actions" ref={buttons}>
      {available.map((code) => (
        <button
          key={code}
          className="button"
          type="button"
          data-action={code}
          onClick={() => setAction(code)}
        >
          {MODERATION_TEXT[code].button}
        </button>
      ))}
    </div>
  );
}

function EventRow({ event }: { event: AdminEvent }) {
  const organizer =
    event.organizer.kind === 'organization' ? (
      <Link className="admin-link" to={`/admin/organizations?id=${event.organizer.id}`}>
        {event.organizer.name}
      </Link>
    ) : (
      event.organizer.name
    );
  return (
    <li className="admin-row">
      <div className="admin-row-head">
        <h2>
          <Link className="admin-link" to={`/events/${event.id}`}>
            {event.title}
          </Link>
        </h2>
        <StatusTag {...EVENT_STATUS_ADMIN[event.status]} />
      </div>
      <dl className="facts admin-facts">
        <dt>Организатор</dt>
        <dd>{organizer}</dd>
        <dt>Направление</dt>
        <dd>{event.sport.name}</dd>
        <dt>Начало</dt>
        <dd>
          {dateTime.format(new Date(event.startsAt))}, {event.city}
        </dd>
        {event.statusReason && (
          <>
            <dt>Причина</dt>
            <dd>{event.statusReason}</dd>
          </>
        )}
      </dl>
      <Moderation event={event} />
      <Discussion eventId={event.id} />
    </li>
  );
}

const EVENT_FILTERS = EVENT_STATUSES.map((status) => ({
  value: status,
  text: EVENT_STATUS_ADMIN[status].text,
}));

function Events() {
  const search = useSearch();
  const list = useAdminEvents(search);
  return (
    <div className="page">
      <h1>Мероприятия</h1>
      <AdminNav />
      <SearchForm statuses={EVENT_FILTERS} label="Поиск мероприятий" />
      {search.organizationId && (
        <p>
          Мероприятия одной организации.{' '}
          <Link className="admin-link" to="/admin/events">
            Показать все
          </Link>
        </p>
      )}
      {search.period === 'week' && (
        <p>
          Статус сменился за последние 7 дней.{' '}
          <Link className="admin-link" to="/admin/events?status=unpublished">
            Все снятые
          </Link>
        </p>
      )}
      <Loading error={list.error} isPending={list.isPending} />
      {list.data && (
        <>
          <Pager page={list.data} />
          <ul className="admin-list">
            {list.data.items.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function HiddenMessageRow({ message }: { message: AdminHiddenMessage }) {
  return (
    <li className="admin-row">
      <div className="admin-row-head">
        <h2>
          <Link
            className="admin-link"
            to={`/admin/events?q=${encodeURIComponent(message.eventTitle)}`}
          >
            {message.eventTitle}
          </Link>
        </h2>
        <StatusTag text="Скрыто модератором" icon="action-hide" tone="off" />
      </div>
      <dl className="facts admin-facts">
        <dt>Автор</dt>
        <dd>{message.author.name}</dd>
        <dt>Когда</dt>
        <dd>{dateTime.format(new Date(message.createdAt))}</dd>
        {message.moderationReason && (
          <>
            <dt>Причина</dt>
            <dd>{message.moderationReason}</dd>
          </>
        )}
      </dl>
      <blockquote className="admin-quote">{message.text}</blockquote>
    </li>
  );
}

function HiddenMessages() {
  const search = useSearch();
  const list = useAdminHiddenMessages(search);
  return (
    <div className="page">
      <h1>Скрытые сообщения</h1>
      <AdminNav />
      <Loading error={list.error} isPending={list.isPending} />
      {list.data && (
        <>
          <Pager page={list.data} />
          <ul className="admin-list">
            {list.data.items.map((message) => (
              <HiddenMessageRow key={message.id} message={message} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

const SPORT_FILTERS = [
  { value: 'main', text: 'Основной список' },
  { value: 'custom', text: 'Пользовательские' },
  { value: 'hidden', text: 'Скрытые' },
];

type SportMode = SportChange['action'];

/** «Объединить с…»: целевое — из подсказок, как в формах; сам дубль в них не предлагается. */
function MergeTarget({
  sport,
  targetId,
  onPick,
}: {
  sport: AdminSport;
  targetId: string | null;
  onPick: (target: { id: string; name: string }) => void;
}) {
  const [text, setText] = useState('');
  const id = useId();
  const suggestions = useSportSuggestions(text);
  const items = (suggestions.data?.items ?? []).filter((item) => item.id !== sport.id);
  return (
    <>
      <div className="field">
        <label htmlFor={`${id}-q`}>Найти направление, в которое перенести мероприятия</label>
        <input
          id={`${id}-q`}
          value={text}
          maxLength={SPORT_NAME_MAX_LENGTH}
          onChange={(change) => setText(change.target.value)}
        />
      </div>
      {items.length > 0 && (
        <ul className="admin-choices" aria-label="Подходящие направления">
          {items.map((item) => (
            <li key={item.id}>
              <button
                className="button"
                type="button"
                aria-pressed={item.id === targetId}
                onClick={() => onPick(item)}
              >
                {item.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Действия с направлением: открыта одна форма; после успеха строка показывает итог. */
function SportActions({ sport }: { sport: AdminSport }) {
  const change = useSportChange();
  const [mode, setMode] = useState<SportMode | null>(null);
  const [name, setName] = useState(sport.name);
  const [category, setCategory] = useState<SportCategory>(sport.category);
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const id = useId();
  const fields = change.error instanceof ApiRequestError ? change.error.fields : {};
  const fieldError = fields.name ?? fields.targetId ?? fields.category;
  const formError = change.error && !fieldError ? errorText(change.error) : undefined;
  const invalid = fieldError
    ? { 'aria-invalid': true, 'aria-describedby': `${id}-error` }
    : undefined;

  const open = (next: SportMode | null) => {
    change.reset();
    setMode(next);
  };
  const send = (submit: FormEvent<HTMLFormElement>, body: SportChange) => {
    submit.preventDefault();
    change.mutate(body, { onSuccess: () => setMode(null) });
  };
  const footer = (submitText: string, disabled = false) => (
    <>
      {fieldError && (
        <p className="field-error" id={`${id}-error`}>
          {fieldError}
        </p>
      )}
      {formError && <p className="form-error">{formError}</p>}
      <div className="admin-actions">
        <button className="button" type="submit" disabled={disabled || change.isPending}>
          {submitText}
        </button>
        <button className="button" type="button" onClick={() => open(null)}>
          Отмена
        </button>
      </div>
    </>
  );

  if (mode === 'rename') {
    return (
      <form
        className="admin-decision"
        onSubmit={(submit) => send(submit, { id: sport.id, action: 'rename', name })}
      >
        <div className="field">
          <label htmlFor={`${id}-name`}>Новое название</label>
          <input
            id={`${id}-name`}
            value={name}
            maxLength={SPORT_NAME_MAX_LENGTH}
            required
            {...invalid}
            onChange={(input) => setName(input.target.value)}
          />
        </div>
        {footer('Сохранить название')}
      </form>
    );
  }
  if (mode === 'merge') {
    return (
      <form
        className="admin-decision"
        onSubmit={(submit) => {
          if (target) send(submit, { id: sport.id, action: 'merge', targetId: target.id });
          else submit.preventDefault();
        }}
      >
        <MergeTarget sport={sport} targetId={target?.id ?? null} onPick={setTarget} />
        {target && (
          <p>
            Мероприятия «{sport.name}» перейдут в «{target.name}». «{sport.name}» станет его прежним
            названием и пропадёт из подсказок.
          </p>
        )}
        {footer('Объединить', !target)}
      </form>
    );
  }
  if (mode === 'promote') {
    return (
      <form
        className="admin-decision"
        onSubmit={(submit) => send(submit, { id: sport.id, action: 'promote', category })}
      >
        <div className="field">
          <label htmlFor={`${id}-category`}>Группа в основном списке</label>
          <select
            id={`${id}-category`}
            value={category}
            {...invalid}
            onChange={(select) => setCategory(select.target.value as SportCategory)}
          >
            {SPORT_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {SPORT_CATEGORY_TITLES[value]}
              </option>
            ))}
          </select>
        </div>
        {footer('Перевести в основной список')}
      </form>
    );
  }
  if (mode === 'hide') {
    return (
      <form
        className="admin-decision"
        onSubmit={(submit) => send(submit, { id: sport.id, action: 'hide' })}
      >
        <p>
          «{sport.name}» пропадёт из подсказок и фильтров. Мероприятия останутся и будут
          показываться в группе «Другое».
        </p>
        {footer('Скрыть направление')}
      </form>
    );
  }
  if (sport.status === 'hidden') return null;
  return (
    <div className="admin-actions">
      <button
        className="button"
        type="button"
        onClick={() => {
          setName(sport.name);
          open('rename');
        }}
      >
        Переименовать
      </button>
      <button
        className="button"
        type="button"
        onClick={() => {
          setTarget(null);
          open('merge');
        }}
      >
        Объединить с…
      </button>
      {sport.isCustom && (
        <button className="button" type="button" onClick={() => open('promote')}>
          В основной список
        </button>
      )}
      <button className="button" type="button" onClick={() => open('hide')}>
        Скрыть
      </button>
    </div>
  );
}

const SPORT_STATUS_ADMIN: Record<'main' | 'custom' | 'hidden', StatusLook> = {
  main: { text: 'Основной список', icon: 'status-confirmed', tone: 'ok' },
  custom: { text: 'Пользовательское', icon: 'status-pending', tone: 'wait' },
  hidden: { text: 'Скрыто', icon: 'action-hide', tone: 'off' },
};

function SportRow({ sport }: { sport: AdminSport }) {
  const kind = sport.status === 'hidden' ? 'hidden' : sport.isCustom ? 'custom' : 'main';
  return (
    <li className="admin-row">
      <div className="admin-row-head">
        <h2>{sport.name}</h2>
        <StatusTag {...SPORT_STATUS_ADMIN[kind]} />
      </div>
      <dl className="facts admin-facts">
        <dt>Группа</dt>
        <dd>{SPORT_CATEGORY_TITLES[sport.category]}</dd>
        <dt>Мероприятий</dt>
        <dd>{sport.eventCount}</dd>
        {sport.aliases.length > 0 && (
          <>
            <dt>Прежние названия</dt>
            <dd>{sport.aliases.join(', ')}</dd>
          </>
        )}
      </dl>
      <SportActions sport={sport} />
    </li>
  );
}

function Sports() {
  const search = useSearch();
  const list = useAdminSports(search);
  return (
    <div className="page">
      <h1>Направления</h1>
      <AdminNav />
      <SearchForm statuses={SPORT_FILTERS} label="Поиск направлений" />
      <Loading error={list.error} isPending={list.isPending} />
      {list.data && (
        <>
          <Pager page={list.data} />
          <ul className="admin-list">
            {list.data.items.map((sport) => (
              <SportRow key={sport.id} sport={sport} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export const AdminOverviewPage = () => (
  <AdminOnly>
    <Overview />
  </AdminOnly>
);

export const AdminOrganizationsPage = () => (
  <AdminOnly>
    <Organizations />
  </AdminOnly>
);

export const AdminEventsPage = () => (
  <AdminOnly>
    <Events />
  </AdminOnly>
);

export const AdminMessagesPage = () => (
  <AdminOnly>
    <HiddenMessages />
  </AdminOnly>
);

export const AdminSportsPage = () => (
  <AdminOnly>
    <Sports />
  </AdminOnly>
);
