import { EVENT_STATUS_VIEW, PARTICIPATION_STATUS_VIEW, shortErrorMessage } from '@tandem/domain';
import type { Action, EventDisplayStatus, StatusView } from '@tandem/domain';
import type { EventCardView } from './api';

// В панели действия на 360 px статус — одной строкой, не длиннее 28 знаков (docs/design.md,
// «Первый экран карточки события»): длинным статусам — короткая форма
const SHORT_TEXT: Record<string, string> = {
  [EVENT_STATUS_VIEW.full.text]: 'Мест нет, есть лист ожидания',
  [EVENT_STATUS_VIEW.unpublished.text]: 'Снято модератором',
  [PARTICIPATION_STATUS_VIEW.waitlist.text]: 'Лист ожидания',
};

const shortView = (view: StatusView): StatusView => ({
  ...view,
  text: SHORT_TEXT[view.text] ?? view.text,
});

// Мероприятие, на которое уже не записаться: его статус важнее статуса записи
const OVER: readonly EventDisplayStatus[] = ['finished', 'cancelled', 'unpublished', 'deleted'];

const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);
const join = (...parts: (string | null | undefined)[]) =>
  parts
    .filter((part): part is string => Boolean(part))
    .map((part, index, all) => (index < all.length - 1 ? sentence(part) : part))
    .join(' ');

export interface CardStatus {
  /** Статус в панели действия — короткой формой. */
  panel: StatusView;
  /** Строка полного статуса под первым блоком; `null` — ей нечего добавить. */
  full: string | null;
}

/**
 * Что показать в панели действия и в строке полного статуса (docs/design.md, «Первый
 * экран карточки события», порядок «Статус и причина неактивной кнопки»).
 */
export function cardStatus(event: EventCardView, main: Action | undefined): CardStatus {
  const eventView = EVENT_STATUS_VIEW[event.displayStatus];
  const participation = event.participation ? PARTICIPATION_STATUS_VIEW[event.participation] : null;
  const ownRecord = event.participation && event.participation !== 'cancelled';
  const decision =
    event.participation === 'rejected' && event.participationReason
      ? `Причина: ${event.participationReason}`
      : null;
  const eventReason =
    event.displayStatus === 'cancelled' || event.displayStatus === 'unpublished'
      ? event.statusReason && `Причина: ${event.statusReason}`
      : null;

  let panel: StatusView;
  let full: string;
  if (OVER.includes(event.displayStatus)) {
    // Неактивную кнопку объясняет статус мероприятия — причина кнопки не повторяется
    panel = shortView(eventView);
    full = join(eventView.text, eventReason, ownRecord ? participation?.text : null, decision);
  } else if (event.participation === 'rejected') {
    panel = shortView(PARTICIPATION_STATUS_VIEW.rejected);
    full = join(PARTICIPATION_STATUS_VIEW.rejected.text, decision);
  } else if (participation && ownRecord) {
    // Запись объясняет и недоступную кнопку («Вы участник» — записываться снова незачем)
    panel = shortView(participation);
    full = join(eventView.text, participation.text);
  } else if (main && !main.enabled && !main.requiresAuth) {
    // Статус говорит «можно», а кнопка недоступна: короткая причина вместо статуса
    panel = {
      text: main.reasonCode ? shortErrorMessage(main.reasonCode) : (main.reason ?? ''),
      icon: 'action-reject',
      tone: 'off',
    };
    // «Мест нет — можно встать в лист ожидания» уже объясняет «Мест нет» кнопки
    const reason = main.reason && !eventView.text.startsWith(main.reason) ? main.reason : null;
    full = join(eventView.text, reason);
  } else {
    panel = shortView(eventView);
    full = eventView.text;
  }
  return { panel, full: full === panel.text ? null : full };
}
