import {
  EVENT_LEVEL_TITLES,
  ORGANIZATION_STATUS_VIEW,
  PARTICIPATION_STATUS_VIEW,
} from '@tandem/domain';
import type {
  EventLevel,
  OrganizationStatus,
  ParticipationStatus,
  StatusView,
} from '@tandem/domain';
import { useId } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router';
import { ICONS, coverUrl } from '../illustrations';
import { useTheme } from '../theme';
import type { IconName } from '../illustrations';
import { leafParts, relativeDay, timeRange } from './dates';
import { Icon } from './Icon';

const isIcon = (name: string): name is IconName => (ICONS as readonly string[]).includes(name);

/** Отрывной листок: месяц, число, день недели. Читается как «Среда, 21 октября». */
interface DateLeafProps {
  date: Date;
  compact?: boolean;
  /** Прежняя дата переноса: листок перечёркнут и приглушён. */
  off?: boolean;
}

export function DateLeaf({ date, compact = false, off = false }: DateLeafProps) {
  const parts = leafParts(date);
  const className = ['date-leaf', compact && 'date-leaf-compact', off && 'date-leaf-off']
    .filter(Boolean)
    .join(' ');
  return (
    <time className={className} dateTime={date.toISOString()}>
      <span className="visually-hidden">{parts.spoken}</span>
      <span className="leaf-month" aria-hidden="true">
        {parts.month}
      </span>
      <span className="leaf-day" aria-hidden="true">
        {parts.day}
      </span>
      <span className="leaf-weekday" aria-hidden="true">
        {parts.weekday}
      </span>
    </time>
  );
}

interface EventDateProps {
  startsAt: Date;
  endsAt?: Date;
  /** «Сейчас» из `useClock()`: относительная подпись следует за демо-часами. */
  now: Date;
  compact?: boolean;
  /** Что стоит под временем — в карточке события это шкала уровня. */
  children?: ReactNode;
}

/** Листок даты, время и относительная подпись «через 2 дня» (ТЗ 2.11). */
export function EventDate({ startsAt, endsAt, now, compact, children }: EventDateProps) {
  return (
    <div className="when">
      <DateLeaf date={startsAt} compact={compact} />
      <div className="when-text">
        <span className="when-time">{timeRange(startsAt, endsAt)}</span>
        <span className="when-relative">{relativeDay(startsAt, now, endsAt)}</span>
        {children}
      </div>
    </div>
  );
}

// Названия уровней — из @tandem/domain; «Любой» в шкале — «Любой уровень» (docs/design.md)
const LEVELS: Record<EventLevel, { name: string; bars: number }> = {
  beginner: { name: EVENT_LEVEL_TITLES.beginner, bars: 1 },
  amateur: { name: EVENT_LEVEL_TITLES.amateur, bars: 2 },
  advanced: { name: EVENT_LEVEL_TITLES.advanced, bars: 3 },
  any: { name: `${EVENT_LEVEL_TITLES.any} уровень`, bars: 0 },
};

/** Три растущих деления: выбранный уровень залит; «Любой» — залиты все. */
export function LevelScale({ level }: { level: EventLevel }) {
  const { name, bars } = LEVELS[level];
  return (
    <div className="level">
      <span className="level-bars" aria-hidden="true">
        {[1, 2, 3].map((bar) => (
          <i key={bar} data-on={bars === 0 || bar === bars ? '' : undefined} />
        ))}
      </span>
      <span className="level-name">
        <span className="visually-hidden">Уровень: </span>
        {name}
      </span>
    </div>
  );
}

/** Бейдж режима записи: пиктограмма и подпись. */
export function ModeBadge({ mode }: { mode: 'free' | 'approval' }) {
  return (
    <span className="mode-badge" data-mode={mode}>
      <Icon name={mode === 'free' ? 'mode-free' : 'mode-request'} />
      {mode === 'free' ? 'Свободно' : 'По заявке'}
    </span>
  );
}

interface StatusBadgeProps {
  view: StatusView;
  /** Причина отклонения или отмены — второй строкой. */
  reason?: string | null;
  /** Без подложки: для ленты и «Моих записей». */
  compact?: boolean;
}

/** Статус всегда текстом, пиктограммой и цветом (ТЗ 2.1, П4). */
export function StatusBadge({ view, reason, compact = false }: StatusBadgeProps) {
  const className = `status status--${view.tone}${compact ? ' status-compact' : ''}`;
  return (
    <div className={className}>
      {isIcon(view.icon) && <Icon name={view.icon} />}
      <span className="status-text">
        {view.text}
        {reason && <span className="status-reason">Причина: {reason}</span>}
      </span>
    </div>
  );
}

export type StepState = 'done' | 'current' | 'upcoming' | 'error';

export interface Step {
  label: string;
  state: StepState;
  /** Пиктограмма текущего шага. */
  icon?: IconName;
  /** Причина под шагом с ошибкой. */
  note?: string | null;
}

const STEP_ICON: Partial<Record<StepState, IconName>> = {
  done: 'action-approve',
  error: 'action-reject',
};

/** Степпер: кружки с линией, подпись под каждым шагом; из 4 шагов на узком — вертикальный. */
export function Stepper({ steps, label }: { steps: Step[]; label: string }) {
  return (
    <div className="stepper-box">
      <ol className="stepper" data-steps={steps.length} aria-label={label}>
        {steps.map((step) => {
          const icon = STEP_ICON[step.state] ?? (step.state === 'current' ? step.icon : undefined);
          return (
            <li
              key={step.label}
              data-state={step.state}
              aria-current={step.state === 'current' ? 'step' : undefined}
            >
              <span className="step-dot">{icon && <Icon name={icon} />}</span>
              <span className="step-label">
                {step.label}
                {step.note && <span className="step-note">{step.note}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Мини-степпер записи (ТЗ 2.5, 2.11): «Заявка → Решение → Вы участник»;
 * свободная запись — один шаг. Лист ожидания и отменённая запись степпером
 * не показываются — только плашкой статуса.
 */
export function ParticipationStepper({
  mode,
  status,
  reason,
}: {
  mode: 'free' | 'approval';
  status: ParticipationStatus;
  reason?: string | null;
}) {
  if (status === 'waitlist' || status === 'cancelled') return null;
  if (mode === 'free') {
    if (status !== 'confirmed') return null;
    return (
      <Stepper label="Запись: вы участник" steps={[{ label: 'Вы участник', state: 'done' }]} />
    );
  }
  const decision: Step =
    status === 'pending'
      ? { label: 'Решение', state: 'current', icon: 'status-pending' }
      : status === 'rejected'
        ? { label: 'Решение', state: 'error', note: reason ?? undefined }
        : { label: 'Решение', state: 'done' };
  const steps: Step[] = [
    { label: 'Заявка', state: 'done' },
    decision,
    { label: 'Вы участник', state: status === 'confirmed' ? 'done' : 'upcoming' },
  ];
  const current =
    status === 'pending'
      ? 'шаг 2 из 3, решение организатора'
      : PARTICIPATION_STATUS_VIEW[status].text.toLowerCase();
  return <Stepper label={`Ход заявки: ${current}`} steps={steps} />;
}

/** Путь организации (ТЗ 2.9): «Профиль → Проверка → Решение → Публикуйте события». */
export function OrganizationStepper({
  status,
  reason,
}: {
  status: OrganizationStatus;
  reason?: string | null;
}) {
  const decided = status === 'approved' || status === 'rejected' || status === 'needs_changes';
  const decision: Step =
    status === 'approved'
      ? { label: 'Решение', state: 'done' }
      : decided
        ? {
            label: `Решение: ${ORGANIZATION_STATUS_VIEW[status].text.toLowerCase()}`,
            state: 'error',
            note: reason,
          }
        : { label: 'Решение', state: 'upcoming' };
  const steps: Step[] = [
    { label: 'Профиль', state: status === 'draft' ? 'current' : 'done', icon: 'action-edit' },
    {
      label: 'Проверка',
      state: status === 'pending' ? 'current' : status === 'draft' ? 'upcoming' : 'done',
      icon: 'status-pending',
    },
    decision,
    {
      label: 'Публикуйте события',
      state: status === 'approved' ? 'current' : 'upcoming',
      icon: 'action-create',
    },
  ];
  const position =
    steps.findIndex((step) => step.state === 'current' || step.state === 'error') + 1;
  return <Stepper label={`Путь организации: шаг ${position} из 4`} steps={steps} />;
}

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Почему действие недоступно — строкой рядом, а не бледной кнопкой. */
  reason?: string;
}

/** Главная кнопка экрана: одна, во всю ширину на мобильном. */
export function PrimaryButton({ reason, disabled, children, ...button }: PrimaryButtonProps) {
  const reasonId = useId();
  const unavailable = disabled || Boolean(reason);
  return (
    <div className="primary-action">
      <button
        className="button button-primary"
        type="button"
        disabled={unavailable}
        aria-describedby={reason ? reasonId : undefined}
        {...button}
      >
        {children}
      </button>
      {reason && (
        <p className="primary-action-reason" id={reasonId}>
          {reason}
        </p>
      )}
    </div>
  );
}

interface EmptyStateProps {
  text: string;
  action?: { label: string; to: string };
}

/** Пустое состояние: иллюстрация, одна строка и одна кнопка (ТЗ 2.11). */
export function EmptyState({ text, action }: EmptyStateProps) {
  const { contrast } = useTheme();
  return (
    <div className="empty-state">
      <img
        className="empty-state-image"
        src={coverUrl('other', { contrast })}
        alt=""
        width={160}
        height={90}
      />
      <p>{text}</p>
      {action && (
        <Link className="button button-primary" to={action.to}>
          {action.label}
        </Link>
      )}
    </div>
  );
}
