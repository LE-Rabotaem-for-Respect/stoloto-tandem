import { EVENT_STATUS_VIEW, PARTICIPATION_STATUS_VIEW } from '@tandem/domain';
import type { Action } from '@tandem/domain';
import { useId, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiRequestError } from '../../shared/api';
import { useClock } from '../../shared/clock';
import { coverAlt, coverUrl } from '../../shared/illustrations';
import { useTheme } from '../../shared/theme';
import {
  EmptyState,
  EventDate,
  Icon,
  LevelScale,
  ModeBadge,
  PrimaryButton,
  StatusBadge,
} from '../../shared/ui';
import { useAuthAction } from '../auth';
import { useEventCard, useJoinEvent } from './api';
import type { EventCardView } from './api';
import { actionLabel, isOrganizerView, primaryAction, secondaryActions } from './actions';

const LEVEL_TEXT = {
  beginner: 'Подойдёт новичкам',
  amateur: 'Для любителей с опытом',
  advanced: 'Для опытных',
  any: 'Любой уровень',
} as const;

/** Главная кнопка: гостю — вход и возврат к действию, недоступная — с причиной рядом. */
function MainAction({ event, action }: { event: EventCardView; action: Action }) {
  const join = useJoinEvent(event.id);
  const run = useAuthAction(action.code, () => {
    if (action.code === 'join') join.mutate();
  });
  const error = join.error instanceof ApiRequestError ? join.error.message : undefined;
  return (
    <>
      <PrimaryButton
        onClick={run}
        disabled={join.isPending}
        reason={action.enabled || action.requiresAuth ? undefined : action.reason}
      >
        {actionLabel(action.code, event.mode)}
      </PrimaryButton>
      {action.requiresAuth && <p className="event-card-hint">{action.reason}</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

/** Прочие действия по `actions[]`: доступные — ссылками на свои экраны, недоступные — с причиной. */
function OtherActions({ event, actions }: { event: EventCardView; actions: Action[] }) {
  if (actions.length === 0) return null;
  return (
    <ul className="event-card-actions">
      {actions.map((action) => {
        const label = actionLabel(action.code, event.mode);
        const target = action.code === 'post_message' ? '#discussion' : `/events/${event.id}/edit`;
        return (
          <li key={action.code}>
            {action.enabled ? (
              target.startsWith('#') ? (
                <a className="button" href={target}>
                  {label}
                </a>
              ) : (
                <Link className="button" to={target}>
                  {label}
                </Link>
              )
            ) : (
              <span className="event-card-action-off">
                {label}: {action.reason}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Organizer({ organizer }: { organizer: EventCardView['organizer'] }) {
  return (
    <p className="event-card-organizer">
      Организатор:{' '}
      {organizer.kind === 'organization' ? (
        <Link to={`/organizations/${organizer.id}`}>{organizer.name}</Link>
      ) : (
        // Публичных страниц пользователей в сервисе нет — только имя
        <>{organizer.name}</>
      )}
    </p>
  );
}

function CardBody({ event }: { event: EventCardView }) {
  const now = useClock();
  const { contrast } = useTheme();
  const main = primaryAction(event.actions);
  const others = secondaryActions(event.actions);
  const view = EVENT_STATUS_VIEW[event.displayStatus];
  const reason =
    event.displayStatus === 'cancelled' || event.displayStatus === 'unpublished'
      ? event.statusReason
      : null;

  return (
    <article className="event-card" aria-labelledby="event-title">
      <img
        className="event-card-cover"
        src={coverUrl(event.sport.category, { contrast })}
        alt={coverAlt(event.sport.category)}
        width={320}
        height={180}
      />
      <div className="event-card-body">
        <div className="event-card-heading">
          <p className="event-card-sport">{event.sport.name}</p>
          <ModeBadge mode={event.mode} />
        </div>
        <h1 id="event-title" className="event-card-title">
          {event.title}
        </h1>
        <EventDate startsAt={new Date(event.startsAt)} endsAt={new Date(event.endsAt)} now={now}>
          <LevelScale level={event.level} />
        </EventDate>
        <p className="event-card-place">
          <Icon name="action-location" />
          {event.city}, {event.area}, {event.placeText}
        </p>
        <StatusBadge view={view} reason={reason} />
        {event.participation && (
          <StatusBadge view={PARTICIPATION_STATUS_VIEW[event.participation]} />
        )}
        {main && <MainAction event={event} action={main} />}
        <Organizer organizer={event.organizer} />
        <OtherActions event={event} actions={others} />

        <details className="event-card-section">
          <summary>Об активности</summary>
          <p className="event-card-text">{event.description}</p>
        </details>
        <details className="event-card-section">
          <summary>Условия</summary>
          <dl className="facts">
            <dt>Уровень</dt>
            <dd>{LEVEL_TEXT[event.level]}</dd>
            <dt>Запись</dt>
            <dd>
              {event.mode === 'free'
                ? 'Свободно — участник записывается сразу'
                : 'По заявке — организатор подтверждает каждого'}
            </dd>
            {event.mode === 'approval' && event.applyQuestion && (
              <>
                <dt>Вопрос к заявке</dt>
                <dd>{event.applyQuestion}</dd>
              </>
            )}
          </dl>
          {event.participantInfo && (
            <div className="event-card-info">
              <h2>Информация для участников</h2>
              <p className="event-card-text">{event.participantInfo}</p>
            </div>
          )}
        </details>
        <section className="event-card-section" aria-labelledby="faq-title">
          <h2 id="faq-title">Частые вопросы</h2>
          <p className="event-card-soon">Здесь появятся ответы организатора на частые вопросы.</p>
        </section>
        <section id="discussion" className="event-card-section" aria-labelledby="discussion-title">
          <h2 id="discussion-title">Обсуждение</h2>
          <p className="event-card-soon">Здесь будет обсуждение мероприятия.</p>
        </section>
      </div>
    </article>
  );
}

type Tab = 'card' | 'participants';

/** У организатора — вкладки «Карточка» и «Участники и заявки» (ТЗ 2.2, 2.4). */
function OrganizerTabs({ event }: { event: EventCardView }) {
  const id = useId();
  const [tab, setTab] = useState<Tab>('card');
  const tabs: { key: Tab; label: string }[] = [
    { key: 'card', label: 'Карточка' },
    { key: 'participants', label: 'Участники и заявки' },
  ];
  return (
    <>
      <div className="event-card-manage">
        <Link className="button" to={`/events/${event.id}/edit`}>
          <Icon name="action-edit" />
          Изменить
        </Link>
      </div>
      <div className="event-card-tabs" role="tablist" aria-label="Разделы мероприятия">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            id={`${id}-${item.key}-tab`}
            aria-selected={tab === item.key}
            aria-controls={`${id}-${item.key}`}
            tabIndex={tab === item.key ? 0 : -1}
            onClick={() => setTab(item.key)}
            onKeyDown={(key) => {
              if (key.key !== 'ArrowRight' && key.key !== 'ArrowLeft') return;
              const next = item.key === 'card' ? 'participants' : 'card';
              setTab(next);
              document.getElementById(`${id}-${next}-tab`)?.focus();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${id}-${tab}`}
        aria-labelledby={`${id}-${tab}-tab`}
        className="event-card-panel"
      >
        {tab === 'card' ? (
          <CardBody event={event} />
        ) : (
          <p className="event-card-soon">Здесь будут участники и заявки на это мероприятие.</p>
        )}
      </div>
    </>
  );
}

/** Карточка мероприятия (ТЗ 2.2): первый экран — всё, чтобы решить и записаться. */
export function EventCardScreen() {
  const { id = '' } = useParams();
  const card = useEventCard(id);

  if (card.isPending) {
    return (
      <p className="page" role="status">
        Загрузка…
      </p>
    );
  }
  if (card.error) {
    const text =
      card.error instanceof ApiRequestError ? card.error.message : 'Не удалось загрузить карточку';
    return (
      <div className="page">
        <EmptyState text={text} action={{ label: 'Найти другое занятие', to: '/' }} />
      </div>
    );
  }
  const event = card.data;
  return (
    <div className="page page-narrow">
      {isOrganizerView(event.actions) ? (
        <OrganizerTabs event={event} />
      ) : (
        <CardBody event={event} />
      )}
    </div>
  );
}
