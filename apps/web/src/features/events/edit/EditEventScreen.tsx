import { useParams } from 'react-router';
import { ApiRequestError } from '../../../shared/api';
import { EmptyState } from '../../../shared/ui';
import { useEventCard } from '../../event-card/api';
import { CreateEventForm } from '../create/CreateEventForm';
import { stateFromCard } from '../create/form-state';

/**
 * «Изменить» мероприятие (ТЗ 2.2): те же шаги, что при создании. Можно ли менять,
 * решает api — по `edit_event` в `actions[]` карточки; недоступное — с причиной.
 */
export function EditEventScreen() {
  const { id = '' } = useParams();
  const card = useEventCard(id);
  const back = { label: 'Вернуться к карточке', to: `/events/${id}` };

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
  const edit = card.data.actions.find((action) => action.code === 'edit_event');
  if (!edit || !edit.enabled) {
    return (
      <div className="page">
        <h1>Изменить мероприятие</h1>
        <EmptyState
          text={edit?.reason ?? 'Изменить мероприятие может только его организатор'}
          action={back}
        />
      </div>
    );
  }
  return (
    <div className="page page-narrow">
      <h1>Изменить мероприятие</h1>
      <CreateEventForm edit={{ eventId: id, initial: stateFromCard(card.data) }} />
    </div>
  );
}
