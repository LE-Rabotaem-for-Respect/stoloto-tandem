import { EVENT_STATUSES, ORGANIZATION_STATUSES, ORGANIZATION_STATUS_VIEW } from '@tandem/domain';
import type { EventStatus, StatusTone } from '@tandem/domain';
import { useId, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { IconName } from '../../shared/illustrations';
import { ApiRequestError } from '../../shared/api';
import { Icon } from '../../shared/ui/Icon';
import { RequireAuth, useMe } from '../auth';
import {
  useAdminEvents,
  useAdminOrganizations,
  useAdminOverview,
  useOrganizationDecision,
} from './api';
import type { AdminEvent, AdminOrganization, AdminSearch } from './api';
import './admin.css';

const EVENT_STATUS_ADMIN: Record<EventStatus, { text: string; icon: IconName; tone: StatusTone }> =
  {
    published: { text: 'Опубликовано', icon: 'status-confirmed', tone: 'ok' },
    cancelled: { text: 'Отменено организатором', icon: 'status-event-cancelled', tone: 'bad' },
    unpublished: { text: 'Снято с публикации', icon: 'action-hide', tone: 'off' },
    deleted: { text: 'Удалено', icon: 'action-delete', tone: 'off' },
  };

/** Статус — текстом, пиктограммой и цветом (ТЗ 2.1, П4). */
function StatusTag({ text, icon, tone }: { text: string; icon: string; tone: StatusTone }) {
  return (
    <span
      className="admin-status"
      style={{ color: `var(--status-${tone}-fg)`, background: `var(--status-${tone}-bg)` }}
    >
      <Icon name={icon as IconName} />
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

function Overview() {
  const overview = useAdminOverview();
  const tiles = overview.data && [
    {
      title: 'Заявки организаций ждут решения',
      value: overview.data.pendingOrganizations,
      to: '/admin/organizations?status=pending',
    },
    {
      title: 'События сняты за неделю',
      value: overview.data.unpublishedEventsLastWeek,
      to: '/admin/events?status=unpublished',
    },
    // Модерация обсуждений — отдельный раздел; до него список ведёт к мероприятиям
    { title: 'Скрытые сообщения', value: overview.data.hiddenMessages, to: '/admin/events' },
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
              <Link className="admin-tile" to={tile.to}>
                <span className="admin-tile-value">{tile.value}</span>
                <span>{tile.title}</span>
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
    setParams(next);
  };
  return (
    <form className="admin-search" role="search" aria-label={label} onSubmit={submit}>
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
    q: params.get('q') ?? undefined,
    status: params.get('status') ?? undefined,
    organizationId: params.get('organizationId') ?? undefined,
  };
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
        <StatusTag {...ORGANIZATION_STATUS_VIEW[organization.status]} />
      </div>
      <dl className="facts">
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
      <Link to={`/admin/events?organizationId=${organization.id}`}>Мероприятия организации</Link>
      {organization.status === 'pending' && <Decision organization={organization} />}
    </li>
  );
}

const ORGANIZATION_FILTERS = ORGANIZATION_STATUSES.map((status) => ({
  value: status,
  text: ORGANIZATION_STATUS_VIEW[status].text,
}));

function Organizations() {
  const search = useSearch();
  const list = useAdminOrganizations(search);
  return (
    <div className="page">
      <h1>Организации</h1>
      <AdminNav />
      <SearchForm statuses={ORGANIZATION_FILTERS} label="Поиск организаций" />
      <Loading error={list.error} isPending={list.isPending} />
      {list.data && (
        <>
          <p role="status">Найдено: {list.data.total}</p>
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

function EventRow({ event }: { event: AdminEvent }) {
  const organizer =
    event.organizer.kind === 'organization' ? (
      <Link to={`/admin/organizations?q=${encodeURIComponent(event.organizer.name)}`}>
        {event.organizer.name}
      </Link>
    ) : (
      event.organizer.name
    );
  return (
    <li className="admin-row">
      <div className="admin-row-head">
        <h2>
          <Link to={`/events/${event.id}`}>{event.title}</Link>
        </h2>
        <StatusTag {...EVENT_STATUS_ADMIN[event.status]} />
      </div>
      <dl className="facts">
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
      <Link to={`/events/${event.id}#discussion`}>Обсуждение</Link>
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
          Мероприятия одной организации. <Link to="/admin/events">Показать все</Link>
        </p>
      )}
      <Loading error={list.error} isPending={list.isPending} />
      {list.data && (
        <>
          <p role="status">Найдено: {list.data.total}</p>
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
