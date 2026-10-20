import { EVENT_LEVELS, SPORT_CATEGORIES } from '@tandem/domain';
import type { EventLevel, SportCategory } from '@tandem/domain';

export const FEED_DATES = ['today', 'tomorrow', 'weekend'] as const;
export type FeedDate = (typeof FEED_DATES)[number];

export const FEED_DATE_TITLES: Record<FeedDate, string> = {
  today: 'Сегодня',
  tomorrow: 'Завтра',
  weekend: 'Выходные',
};

const MODES = ['free', 'approval'] as const;

/** Фильтры ленты (ТЗ 2.8): живут в адресе страницы — ссылкой можно поделиться. */
export interface FeedFilters {
  q: string;
  category?: SportCategory;
  date?: FeedDate;
  city: string;
  area: string;
  level?: EventLevel;
  mode?: 'free' | 'approval';
}

const oneOf = <T extends string>(values: readonly T[], value: string | null): T | undefined =>
  values.find((item) => item === value);

// Длина — как принимает api (EventFeedQuery): длинный текст из ссылки не даёт 400
const clip = (value: string | null, max: number) =>
  Array.from(value ?? '')
    .slice(0, max)
    .join('');

/** Адрес → фильтры; неизвестные значения отбрасываются, а не уходят в api. */
export function readFilters(params: URLSearchParams): FeedFilters {
  return {
    q: clip(params.get('q'), 100),
    category: oneOf(SPORT_CATEGORIES, params.get('category')),
    date: oneOf(FEED_DATES, params.get('date')),
    city: clip(params.get('city'), 80),
    area: clip(params.get('area'), 120),
    level: oneOf(EVENT_LEVELS, params.get('level')),
    mode: oneOf(MODES, params.get('mode')),
  };
}

/** Фильтры → параметры адреса и запроса: пустые не пишутся. */
export function filterParams(filters: FeedFilters): URLSearchParams {
  const params = new URLSearchParams();
  const put = (key: string, value: string | undefined) => {
    const clean = value?.trim();
    if (clean) params.set(key, clean);
  };
  put('q', filters.q);
  put('category', filters.category);
  put('date', filters.date);
  put('city', filters.city);
  put('area', filters.area);
  put('level', filters.level);
  put('mode', filters.mode);
  return params;
}

/** Сколько фильтров из свёрнутого блока включено — число на кнопке «Фильтры». */
export function hiddenFilterCount(filters: FeedFilters): number {
  return [
    filters.category,
    filters.city.trim(),
    filters.area.trim(),
    filters.level,
    filters.mode,
  ].filter(Boolean).length;
}
