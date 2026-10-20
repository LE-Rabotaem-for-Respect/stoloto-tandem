import { PARTICIPATION_STATUS_VIEW } from '@tandem/domain';
import type { Action } from '@tandem/domain';
import { useId, useState, useSyncExternalStore } from 'react';
import type { FormEvent, KeyboardEvent, ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { ApiRequestError } from '../../shared/api';
import { useClock } from '../../shared/clock';
import { coverAlt, coverUrl } from '../../shared/illustrations';
import type { IconName } from '../../shared/illustrations';
import { useTheme } from '../../shared/theme';
import {
  EmptyState,
  EventDate,
  Icon,
  LevelScale,
  ModeBadge,
  ParticipationStepper,
  PrimaryButton,
  Seats,
  StatusBadge,
  TextAreaField,
} from '../../shared/ui';
import { loginPath, useAuthAction } from '../auth';
import { Discussion } from '../discussion';
import { useEventCard, useParticipationAction } from './api';
import type { EventCardView } from './api';
import { actionLabel, actionTarget, findAction, primaryAction, secondaryActions } from './actions';
import { ParticipantsPanel } from './participants';
import { cardStatus } from './status';

const LEVEL_TEXT = {
  beginner: 'Подойдёт новичкам',
  amateur: 'Для любителей с опытом',
  advanced: 'Для опытных',
  any: 'Любой уровень',
} as const;

/** Текст организатора по абзацам: пустая строка или перенос — граница абзаца. */
const paragraphs = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

// Ошибка поля важнее общей: «Ответьте на вопрос организатора», а не «Проверьте поля формы»
function errorText(error: unknown): string {
  if (!(error instanceof ApiRequestError)) return 'Не получилось. Попробуйте ещё раз';
  return Object.values(error.fields)[0] ?? error.message;
}

type Participation = ReturnType<typeof useParticipationAction>;
/** Что раскрыто под панелью действия: ответ на вопрос к заявке или подтверждение отмены. */
type Step = 'idle' | 'answer' | 'confirm';

const mainButtonId = (eventId: string) => `event-main-${eventId}`;

/**
 * Главная кнопка: гостю — вход и возврат к действию; недоступная — `disabled`, почему —
 * в строке полного статуса или в плашке панели (`describedBy`). Заявка с вопросом
 * организатора и отмена записи сначала раскрывают форму под панелью (ТЗ 2.4, 3.3).
 */
function MainAction({
  event,
  action,
  describedBy,
  participation,
  onStep,
}: {
  event: EventCardView;
  action: Action;
  describedBy: string;
  participation: Participation;
  onStep(step: Step): void;
}) {
  const needsAnswer =
    action.code === 'join' && event.mode === 'approval' && Boolean(event.applyQuestion);
  const run = useAuthAction(action.code, () => {
    if (needsAnswer) onStep('answer');
    else if (action.code === 'leave') onStep('confirm');
    else if (action.code === 'join') participation.mutate({ action: 'join' });
  });
  const unavailable = !action.enabled && !action.requiresAuth;
  return (
    <PrimaryButton
      id={mainButtonId(event.id)}
      onClick={run}
      disabled={participation.isPending || unavailable}
      aria-describedby={describedBy}
    >
      {actionLabel(action.code, event.mode)}
    </PrimaryButton>
  );
}

interface StepProps {
  event: EventCardView;
  participation: Participation;
  onDone(): void;
}

/** Ответ на вопрос организатора перед заявкой (ТЗ 2.4). */
function AnswerForm({ event, participation, onDone }: StepProps) {
  const [answer, setAnswer] = useState('');
  const submit = (form: FormEvent) => {
    form.preventDefault();
    participation.mutate({ action: 'join', answer }, { onSuccess: onDone });
  };
  return (
    <form className="event-card-step" onSubmit={submit} aria-label="Заявка">
      <TextAreaField
        label={event.applyQuestion ?? ''}
        value={answer}
        maxLength={1000}
        rows={3}
        autoFocus
        onChange={(change) => setAnswer(change.target.value)}
      />
      <div className="event-card-step-buttons">
        <button className="button button-primary" type="submit" disabled={participation.isPending}>
          Отправить заявку
        </button>
        <button className="button" type="button" onClick={onDone}>
          Отмена
        </button>
      </div>
    </form>
  );
}

/** «Отменить запись» — только после подтверждения (ТЗ 3.3). */
function LeaveConfirm({ event, participation, onDone }: StepProps) {
  const questionId = useId();
  return (
    <div className="event-card-step" role="group" aria-labelledby={questionId}>
      <p id={questionId}>Отменить запись на «{event.title}»?</p>
      <div className="event-card-step-buttons">
        <button
          className="button button-primary"
          type="button"
          autoFocus
          disabled={participation.isPending}
          onClick={() => participation.mutate({ action: 'leave' }, { onSuccess: onDone })}
        >
          Да, отменить
        </button>
        <button className="button" type="button" onClick={onDone}>
          Не отменять
        </button>
      </div>
    </div>
  );
}

/**
 * Своя запись крупным блоком (ТЗ 2.5, 2.11): статус текстом, пиктограммой и цветом и
 * мини-степпер; подтверждённому — «Информация для участников», отказ — с причиной.
 */
function MyParticipation({ event }: { event: EventCardView }) {
  if (!event.participation && !event.participantInfo) return null;
  return (
    <section className="event-card-mine" aria-label="Ваша запись">
      {event.participation && (
        <>
          {/* Причина отказа — под шагом «Решение» степпера, без повтора в плашке */}
          <StatusBadge view={PARTICIPATION_STATUS_VIEW[event.participation]} />
          <ParticipationStepper
            mode={event.mode}
            status={event.participation}
            reason={event.participationReason}
          />
        </>
      )}
      {event.participantInfo && (
        <div className="event-card-info">
          <h2>Информация для участников</h2>
          <p className="event-card-text">{event.participantInfo}</p>
        </div>
      )}
    </section>
  );
}

/**
 * Прочие действия по `actions[]`: доступные — ссылками на свои экраны, гостю — на вход
 * с возвратом (ТЗ 2.6), недоступные — с причиной.
 */
function OtherActions({ event, actions }: { event: EventCardView; actions: Action[] }) {
  const location = useLocation();
  if (actions.length === 0) return null;
  return (
    <ul className="event-card-actions">
      {actions.map((action) => {
        const label = actionLabel(action.code, event.mode);
        const target = actionTarget(action.code, event.id);
        let content;
        if (action.requiresAuth) {
          content = (
            <Link className="button" to={loginPath(location.pathname + location.search)}>
              {label}
            </Link>
          );
        } else if (!action.enabled) {
          content = (
            <span className="event-card-action-off">
              {label}: {action.reason}
            </span>
          );
        } else if (target === null) {
          content = <span className="event-card-action-off">{label} — в разделе модерации</span>;
        } else if (target.startsWith('#')) {
          content = (
            <a className="button" href={target}>
              {label}
            </a>
          );
        } else {
          content = (
            <Link className="button" to={target}>
              {label}
            </Link>
          );
        }
        return <li key={action.code}>{content}</li>;
      })}
    </ul>
  );
}

/** «Изменить» — только если api дал `edit_event`; неактивное — с причиной. */
function EditLink({ event }: { event: EventCardView }) {
  const edit = findAction(event.actions, 'edit_event');
  if (!edit) return null;
  if (!edit.enabled) {
    return (
      <p className="event-card-action-off">
        {actionLabel('edit_event', event.mode)}: {edit.reason}
      </p>
    );
  }
  return (
    <Link className="button event-card-edit" to={`/events/${event.id}/edit`}>
      <Icon name="action-edit" />
      {actionLabel('edit_event', event.mode)}
    </Link>
  );
}

/** Организатор — плашкой с кружком-инициалом: подпись мелко, имя крупно. */
function Organizer({ organizer }: { organizer: EventCardView['organizer'] }) {
  return (
    <p className="event-card-organizer">
      <span className="organizer-avatar" aria-hidden="true">
        {organizer.name.trim().charAt(0).toUpperCase()}
      </span>
      <span className="organizer-text">
        <span className="organizer-label">Организатор</span>{' '}
        {organizer.kind === 'organization' ? (
          <Link className="organizer-name" to={`/organizations/${organizer.id}`}>
            {organizer.name}
          </Link>
        ) : (
          // Публичных страниц пользователей в сервисе нет — только имя
          <span className="organizer-name">{organizer.name}</span>
        )}
      </span>
    </p>
  );
}

/** Одна плитка «Условий»: пиктограмма, короткая подпись и значение крупнее. */
function Fact({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  return (
    <div className="fact-tile">
      <dt>
        <Icon name={icon} />
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

// От 768 px панель действия — в потоке карточки, и статус в ней — полным текстом
// (docs/design.md, «Первый экран карточки события»): строка полного статуса не нужна
const WIDE = '(min-width: 768px)';

function subscribeWide(onChange: () => void) {
  const query = window.matchMedia?.(WIDE);
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
}

const useWide = () =>
  useSyncExternalStore(subscribeWide, () => window.matchMedia?.(WIDE).matches ?? false);

function CardBody({ event }: { event: EventCardView }) {
  const now = useClock();
  const { contrast } = useTheme();
  const id = useId();
  const main = primaryAction(event.actions);
  const others = secondaryActions(event.actions);
  const narrow = cardStatus(event, main);
  const wide = useWide();
  const status =
    wide && narrow.full ? { panel: { ...narrow.panel, text: narrow.full }, full: null } : narrow;
  const fullId = `${id}-full`;
  const panelId = `${id}-panel`;
  const participation = useParticipationAction(event.id);
  const [step, setStep] = useState<Step>('idle');
  const done = () => {
    setStep('idle');
    // Форма закрылась — фокус обратно на главную кнопку, а не на body
    requestAnimationFrame(() => document.getElementById(mainButtonId(event.id))?.focus());
  };
  const place = `${event.city}, ${event.area}, ${event.placeText}`;

  return (
    <article className="event-card" aria-labelledby="event-title">
      <img
        className="event-card-cover"
        // Поля вписанного рисунка — фон группы; в «Контрасте» — фон темы: инверсия
        // контурной обложки перекрасила бы и фон
        style={contrast ? undefined : { background: `var(--cover-${event.sport.category})` }}
        src={coverUrl(event.sport.category, { contrast })}
        alt={coverAlt(event.sport.category)}
        width={360}
        height={72}
      />
      <div className="event-card-body">
        {/* Первый экран на 360 px (ТЗ 2.11, docs/design.md): всё для решения, а статус и
            главная кнопка — в панели действия, которая до 768 px липнет над нижней панелью */}
        <div className="event-card-first">
          <div className="event-card-heading">
            <p className="event-card-sport">{event.sport.name}</p>
            <ModeBadge mode={event.mode} />
          </div>
          <h1 id="event-title" className="event-card-title">
            {event.title}
          </h1>
          <EventDate
            startsAt={new Date(event.startsAt)}
            endsAt={new Date(event.endsAt)}
            now={now}
            compact
          >
            <LevelScale level={event.level} />
          </EventDate>
          <p className="event-card-place">
            <Icon name="action-location" />
            <span className="event-card-place-text">{place}</span>
          </p>
          {/* До 10 кружков ряд помещается на 360 px, больше — полоса с подписью в той же
              строке: перенос кружков увёл бы подпись под панель действия */}
          <Seats capacity={event.capacity} taken={event.confirmedCount} maxDots={10} />
          <div className="event-card-action">
            <div id={panelId} aria-describedby={status.full ? fullId : undefined}>
              <StatusBadge view={status.panel} compact />
            </div>
            {main && (
              <MainAction
                event={event}
                action={main}
                describedBy={status.full ? fullId : panelId}
                participation={participation}
                onStep={setStep}
              />
            )}
          </div>
          {participation.error && (
            <p className="form-error" role="alert">
              {errorText(participation.error)}
            </p>
          )}
          {step === 'answer' && (
            <AnswerForm event={event} participation={participation} onDone={done} />
          )}
          {step === 'confirm' && (
            <LeaveConfirm event={event} participation={participation} onDone={done} />
          )}
          {status.full && (
            <p id={fullId} className="event-card-full-status" data-tone={status.panel.tone}>
              {status.full}
            </p>
          )}
        </div>
        <MyParticipation event={event} />
        <EditLink event={event} />
        <Organizer organizer={event.organizer} />
        <OtherActions event={event} actions={others} />

        <details className="event-card-section">
          <summary>Об активности</summary>
          {/* Абзацы организатора — отдельными блоками с воздухом между ними */}
          <div className="event-card-about">
            {paragraphs(event.description).map((text, index) => (
              <p key={index} className="event-card-text">
                {text}
              </p>
            ))}
          </div>
        </details>
        <details className="event-card-section">
          <summary>Условия</summary>
          {/* Плитки вместо сплошной таблицы: за пиктограмму и подпись цепляется глаз */}
          <dl className="fact-tiles">
            {/* Полное направление: на первом экране до 768 px оно может быть обрезано */}
            <Fact icon="action-racket" label="Направление">
              {event.sport.name}
            </Fact>
            <Fact icon="action-location" label="Место">
              {place}
            </Fact>
            <Fact icon="action-shoes" label="Уровень">
              {LEVEL_TEXT[event.level]}
            </Fact>
            <Fact icon={event.mode === 'free' ? 'mode-free' : 'mode-request'} label="Запись">
              {event.mode === 'free'
                ? 'Свободно — участник записывается сразу'
                : 'По заявке — организатор подтверждает каждого'}
            </Fact>
            {event.mode === 'approval' && event.applyQuestion && (
              <Fact icon="action-message" label="Вопрос к заявке">
                {event.applyQuestion}
              </Fact>
            )}
          </dl>
        </details>
        <section className="event-card-section" aria-labelledby="faq-title">
          <h2 id="faq-title">Частые вопросы</h2>
          <p className="event-card-soon">
            <Icon name="action-message" />
            Здесь появятся ответы организатора на частые вопросы.
          </p>
        </section>
        <Discussion eventId={event.id} post={findAction(event.actions, 'post_message')} />
      </div>
    </article>
  );
}

const TABS = [
  { key: 'card', label: 'Карточка' },
  { key: 'participants', label: 'Участники и заявки' },
] as const;
type Tab = (typeof TABS)[number]['key'];

/** У организатора — вкладки «Карточка» и «Участники и заявки» (ТЗ 2.2, 2.4). */
function ParticipantsTabs({ event }: { event: EventCardView }) {
  const id = useId();
  const [tab, setTab] = useState<Tab>('card');

  // Стрелки переключают вкладку и переносят на неё фокус (шаблон tablist)
  const onKeyDown = (key: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = key.key === 'ArrowRight' ? 1 : key.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    key.preventDefault();
    const next = TABS[(index + step + TABS.length) % TABS.length];
    if (!next) return;
    setTab(next.key);
    document.getElementById(`${id}-${next.key}-tab`)?.focus();
  };

  return (
    <>
      <div className="event-card-tabs" role="tablist" aria-label="Разделы мероприятия">
        {TABS.map((item, index) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            id={`${id}-${item.key}-tab`}
            aria-selected={tab === item.key}
            aria-controls={`${id}-${item.key}`}
            tabIndex={tab === item.key ? 0 : -1}
            onClick={() => setTab(item.key)}
            onKeyDown={(key) => onKeyDown(key, index)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${id}-card`}
        aria-labelledby={`${id}-card-tab`}
        hidden={tab !== 'card'}
      >
        <CardBody event={event} />
      </div>
      {/* Панель без фокусируемого содержимого сама в обходе Tab (шаблон APG) */}
      <div
        role="tabpanel"
        id={`${id}-participants`}
        aria-labelledby={`${id}-participants-tab`}
        hidden={tab !== 'participants'}
        tabIndex={0}
      >
        <ParticipantsPanel eventId={event.id} active={tab === 'participants'} />
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
    <div className="page page-event">
      {findAction(event.actions, 'view_participants') ? (
        <ParticipantsTabs event={event} />
      ) : (
        <CardBody event={event} />
      )}
    </div>
  );
}
