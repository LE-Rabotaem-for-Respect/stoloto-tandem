import { EVENT_STATUSES, ORGANIZATION_STATUSES, ORGANIZATION_STATUS_VIEW } from '@tandem/domain';
import type { EventStatus, OrganizationStatus, StatusTone } from '@tandem/domain';
import { useId, useState } from 'react';
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
  useDiscussion,
  useOrganizationDecision,
} from './api';
import type { AdminEvent, AdminHiddenMessage, AdminOrganization, AdminSearch, Page } from './api';
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
