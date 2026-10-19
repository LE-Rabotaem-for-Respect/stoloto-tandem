/** Уровень мероприятия (ТЗ 3.1; в P0 из условий участия — только он). Ключи совпадают с enum в базе. */
export const EVENT_LEVELS = ['beginner', 'amateur', 'advanced', 'any'] as const;

export type EventLevel = (typeof EVENT_LEVELS)[number];

export const EVENT_LEVEL_TITLES: Record<EventLevel, string> = {
  beginner: 'Новичок',
  amateur: 'Любитель',
  advanced: 'Опытный',
  any: 'Любой',
};
