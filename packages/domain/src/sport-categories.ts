/** Группы направлений (ТЗ 2.3): фильтры, обложки и Хелфигочи. Ключи совпадают с enum в базе. */
export const SPORT_CATEGORIES = [
  'team',
  'endurance',
  'intellectual',
  'martial',
  'fitness',
  'water',
  'winter',
  'other',
] as const;

export type SportCategory = (typeof SPORT_CATEGORIES)[number];

/** Группа пользовательского направления, если автор её не выбрал. */
export const DEFAULT_SPORT_CATEGORY: SportCategory = 'other';

export const SPORT_CATEGORY_TITLES: Record<SportCategory, string> = {
  team: 'Командные',
  endurance: 'Выносливость',
  intellectual: 'Интеллектуальные',
  martial: 'Единоборства',
  fitness: 'Фитнес и зарядка',
  water: 'Водные',
  winter: 'Зимние',
  other: 'Другое',
};
