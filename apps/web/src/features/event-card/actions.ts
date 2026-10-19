import type { Action, ActionCode } from '@tandem/domain';

/** Главная кнопка карточки — одна (ТЗ 2.2): запись или отмена записи, если api её даёт. */
const PRIMARY: ActionCode[] = ['join', 'leave'];

// Управление мероприятием api даёт только организатору
const MANAGE: ActionCode[] = ['edit_event', 'reschedule_event', 'cancel_event'];

export function primaryAction(actions: Action[]): Action | undefined {
  return PRIMARY.map((code) => actions.find((action) => action.code === code)).find(Boolean);
}

/** Прочие действия — всё, кроме главной кнопки, в порядке ответа api. */
export function secondaryActions(actions: Action[]): Action[] {
  const primary = primaryAction(actions);
  return actions.filter((action) => action !== primary);
}

/** Смотрит организатор: api дал ему действия управления мероприятием. */
export const isOrganizerView = (actions: Action[]) =>
  actions.some((action) => MANAGE.includes(action.code));

const LABELS: Partial<Record<ActionCode, string>> = {
  leave: 'Отменить запись',
  edit_event: 'Изменить',
  reschedule_event: 'Перенести',
  cancel_event: 'Отменить мероприятие',
  post_message: 'Написать в обсуждение',
  unpublish_event: 'Снять с публикации',
  restore_event: 'Вернуть в публикацию',
  delete_event: 'Удалить',
};

/** Подпись действия; запись зависит от режима: «Записаться» или «Подать заявку». */
export function actionLabel(code: ActionCode, mode: 'free' | 'approval'): string {
  if (code === 'join') return mode === 'free' ? 'Записаться' : 'Подать заявку';
  return LABELS[code] ?? code;
}
