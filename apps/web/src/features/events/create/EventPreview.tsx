import { coverAlt, coverUrl } from '../../../shared/illustrations';
import { useTheme } from '../../../shared/theme';
import { EventDate, Icon, LevelScale, ModeBadge } from '../../../shared/ui';
import { krasnoyarskTime } from './form-state';
import type { CreateEventState } from './form-state';

/**
 * Предпросмотр карточки той же графикой, что увидят участники: обложка группы,
 * листок даты, шкала уровня и бейдж режима. Незаполненное — подсказкой.
 */
export function EventPreview({ state, now }: { state: CreateEventState; now: Date }) {
  const { contrast } = useTheme();
  const startsAt = krasnoyarskTime(state.date, state.startTime);
  const endsAt = krasnoyarskTime(state.date, state.endTime);
  const category = state.sport?.category ?? 'other';
  const place = [state.area.trim(), state.placeText.trim()].filter(Boolean).join(', ');

  return (
    <article className="event-preview">
      <img
        className="event-preview-cover"
        // Поля по бокам вписанного рисунка — фон группы; в «Контрасте» фон темы: инверсия
        // контурной обложки перекрасила бы и фон
        style={contrast ? undefined : { background: `var(--cover-${category})` }}
        src={coverUrl(category, { contrast })}
        alt={coverAlt(category)}
        width={360}
        height={72}
      />
      <div className="event-preview-body">
        <div className="event-preview-heading">
          <p className="event-preview-sport">{state.sport?.name ?? 'Направление не выбрано'}</p>
          {state.mode && <ModeBadge mode={state.mode} />}
        </div>
        <h4 className="event-preview-title">{state.title.trim() || 'Без названия'}</h4>
        {startsAt ? (
          <EventDate startsAt={startsAt} endsAt={endsAt ?? undefined} now={now}>
            {state.level && <LevelScale level={state.level} />}
          </EventDate>
        ) : (
          <>
            <p className="event-preview-missing">Дата и время не указаны</p>
            {state.level && <LevelScale level={state.level} />}
          </>
        )}
        <p className="event-preview-place">
          <Icon name="action-location" />
          {place ? `${state.city.trim()}, ${place}` : 'Место не указано'}
        </p>
      </div>
    </article>
  );
}
