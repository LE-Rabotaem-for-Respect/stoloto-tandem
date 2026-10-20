import {
  EVENT_STATUS_VIEW,
  PARTICIPATION_GROUPS,
  PARTICIPATION_GROUP_TITLES,
  PARTICIPATION_STATUS_VIEW,
  participationStatusText,
} from '@tandem/domain';
import type { EventDisplayStatus } from '@tandem/domain';
import { Link } from 'react-router';
import { useClock } from '../../shared/clock';
import { EmptyState, EventDate, StatusBadge } from '../../shared/ui';
import { useMyParticipations } from './api';
import type { MyParticipation } from './api';

// Статус мероприятия рядом со статусом записи — только когда он меняет дело
const NOTABLE: readonly EventDisplayStatus[] = [
  'rescheduled',
  'cancelled',
  'unpublished',
  'deleted',
];

function Row({ item, now }: { item: MyParticipation; now: Date }) {
  const { event } = item;
  const view = {
    ...PARTICIPATION_STATUS_VIEW[item.status],
    text: participationStatusText(item.status, item.waitlistPosition ?? undefined),
  };
  return (
    <li>
      <Link className="my-participation" to={`/events/${event.id}`}>
        <EventDate
          startsAt={new Date(event.startsAt)}
          endsAt={new Date(event.endsAt)}
          now={now}
          compact
        />
        <span className="my-participation-text">
          <span className="my-participation-title">{event.title}</span>
          <span className="my-participation-meta">
            {event.sport.name} · {event.area ? `${event.city}, ${event.area}` : event.city}
          </span>
          <StatusBadge view={view} reason={item.decisionReason} compact />
          {NOTABLE.includes(event.displayStatus) && (
            <StatusBadge view={EVENT_STATUS_VIEW[event.displayStatus]} compact />
          )}
        </span>
      </Link>
    </li>
  );
}

/**
 * «Мои записи» (ТЗ 2.5): группы «Предстоящие», «Ждут решения», «Прошедшие»; статус —
 * текстом, пиктограммой и цветом; строка ведёт в карточку мероприятия.
 */
export function MyParticipations() {
  const participations = useMyParticipations();
  const now = useClock();

  if (participations.isPending) return <p role="status">Загрузка…</p>;
  if (participations.isError) {
    return <p role="alert">Не удалось загрузить записи. Попробуйте обновить страницу</p>;
  }
  const { items } = participations.data;
  if (items.length === 0) {
    return (
      <EmptyState
        text="Вы пока никуда не записались"
        action={{ label: 'Найти событие', to: '/' }}
      />
    );
  }
  return (
    <>
      {PARTICIPATION_GROUPS.map((group) => {
        const rows = items.filter((item) => item.group === group);
        if (rows.length === 0) return null;
        const heading = `my-group-${group}`;
        return (
          <section key={group} className="my-group" aria-labelledby={heading}>
            <h2 id={heading}>{PARTICIPATION_GROUP_TITLES[group]}</h2>
            <ul className="my-participations">
              {rows.map((item) => (
                <Row key={item.id} item={item} now={now} />
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
