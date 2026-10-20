import { EVENT_STATUS_VIEW, SPORT_CATEGORY_TITLES } from '@tandem/domain';
import { Link, useParams } from 'react-router';
import { ApiRequestError } from '../../shared/api';
import { useClock } from '../../shared/clock';
import { EmptyState, EventDate, Icon, StatusBadge } from '../../shared/ui';
import { linkLabel } from '../../shared/links';
import { useOrganization, useOrganizationEvents } from './api';

/** Ссылку на сайт показываем только для http и https: другой адрес — просто текстом. */
function websiteHref(website: string): string | undefined {
  try {
    const url = new URL(website);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function OrganizationEvents({ id }: { id: string }) {
  const events = useOrganizationEvents(id);
  const now = useClock();
  if (events.isPending) return <p role="status">Загрузка мероприятий…</p>;
  if (events.isError) {
    return (
      <div role="alert">
        <p>{events.error.message}</p>
        <button className="button" type="button" onClick={() => void events.refetch()}>
          Повторить
        </button>
      </div>
    );
  }
  if (events.data.items.length === 0) {
    return (
      <EmptyState
        text="Сейчас открытых мероприятий нет"
        action={{ label: 'Найти занятие', to: '/' }}
      />
    );
  }
  const { items, total } = events.data;
  return (
    <>
      <ul className="org-events">
        {items.map((event) => (
          <li key={event.id} className="org-event">
            <EventDate
              startsAt={new Date(event.startsAt)}
              endsAt={new Date(event.endsAt)}
              now={now}
              compact
            />
            <div className="org-event-text">
              <Link to={`/events/${event.id}`}>{event.title}</Link>
              <span>
                {event.sport.name} · {event.area ? `${event.city}, ${event.area}` : event.city}
              </span>
              <StatusBadge view={EVENT_STATUS_VIEW[event.displayStatus]} compact />
            </div>
          </li>
        ))}
      </ul>
      {total > items.length && (
        <p className="org-events-more">
          Показаны ближайшие {items.length} из {total} — остальные найдутся в ленте
        </p>
      )}
    </>
  );
}

function PublicOrganization({ id }: { id: string }) {
  const organization = useOrganization(id);
  if (organization.isPending) return <p role="status">Загрузка…</p>;
  if (organization.isError) {
    if (organization.error instanceof ApiRequestError && organization.error.status === 404) {
      return (
        <>
          <h1>Организация не найдена</h1>
          <p>
            <Link to="/">Перейти к поиску занятий</Link>
          </p>
        </>
      );
    }
    return (
      <div role="alert">
        <p>{organization.error.message}</p>
        <button className="button" type="button" onClick={() => void organization.refetch()}>
          Повторить
        </button>
      </div>
    );
  }
  const data = organization.data;
  const href = data.website ? websiteHref(data.website) : undefined;
  // Подпись — хост в punycode и путь: «vк.com» с кириллической «к» видна как xn--…
  const label = data.website ? linkLabel(data.website) : null;
  return (
    <>
      {/* Шапка — цветным блоком: название, город ярлыком, описание крупнее основного текста */}
      <header className="org-hero">
        <h1>{data.name}</h1>
        <p className="org-city">
          <Icon name="action-location" />
          {data.city}
        </p>
        <p className="org-description">{data.description}</p>
      </header>
      <div className="org-columns">
        <section className="org-section" aria-labelledby="org-sports-title">
          <h2 id="org-sports-title">Направления</h2>
          <ul className="org-sports-list">
            {data.sports.map((sport) => (
              <li key={sport.id} className="org-sport">
                <span>{sport.name}</span>
                <span className="org-sport-category">{SPORT_CATEGORY_TITLES[sport.category]}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="org-section" aria-labelledby="org-contacts-title">
          <h2 id="org-contacts-title">Контакты</h2>
          <p className="org-contacts">
            <Icon name="action-message" />
            <span>{data.contacts}</span>
          </p>
          {data.website && (
            <p className="org-website">
              <Icon name="action-search" />
              {href && label ? (
                <a href={href} target="_blank" rel="noopener noreferrer nofollow">
                  {label}
                </a>
              ) : (
                data.website
              )}
            </p>
          )}
        </section>
      </div>
      <section className="org-section" aria-labelledby="org-events-title">
        <h2 id="org-events-title">Мероприятия</h2>
        <OrganizationEvents id={data.id} />
      </section>
    </>
  );
}

/** Публичная страница одобренной организации (ТЗ 2.9): описание, направления, мероприятия. */
export function PublicOrganizationPage() {
  const { id = '' } = useParams();
  return (
    <div className="page">
      <PublicOrganization id={id} />
    </div>
  );
}
