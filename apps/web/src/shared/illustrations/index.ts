// Обложки групп направлений и пиктограммы статусов и действий.
// Цветная обложка — для обычной темы и «Крупного текста», контурная
// (без заливок и полупрозрачности, цвет — currentColor) — для «Высокого контраста».
// Ключи и названия групп — SPORT_CATEGORIES из @tandem/domain, те же, что в базе и api.

import { SPORT_CATEGORIES, SPORT_CATEGORY_TITLES } from '@tandem/domain';
import type { SportCategory } from '@tandem/domain';

export const ICONS = [
  'status-pending',
  'status-confirmed',
  'status-waitlist',
  'status-rejected',
  'status-cancelled',
  'status-event-cancelled',
  'status-finished',
  'status-full',
  'status-rescheduled',
  'status-ongoing',
  'mode-free',
  'mode-request',
  'action-join',
  'action-leave',
  'action-create',
  'action-edit',
  'action-message',
  'action-notify',
  'action-search',
  'action-filter',
  'action-calendar',
  'action-location',
  'action-approve',
  'action-reject',
  'action-hide',
  'action-delete',
  'action-back',
] as const;

export type IconName = (typeof ICONS)[number];

export function isSportCategory(value: unknown): value is SportCategory {
  return typeof value === 'string' && (SPORT_CATEGORIES as readonly string[]).includes(value);
}

// Направление без группы, с неизвестной или скрытой группой показывается
// как «Другое» (ТЗ 2.3), поэтому новый вид спорта не требует новой картинки.
export function sportCategoryOrOther(group: string | null | undefined): SportCategory {
  return isSportCategory(group) ? group : 'other';
}

export interface CoverOptions {
  contrast?: boolean;
}

export function coverPath(group: string | null | undefined, options: CoverOptions = {}): string {
  const key = sportCategoryOrOther(group);
  return options.contrast ? `covers/outline/${key}.svg` : `covers/${key}.svg`;
}

// Шаблоны путей в new URL(...) — статические, чтобы сборщик нашёл и
// скопировал файлы.
export function coverUrl(group: string | null | undefined, options: CoverOptions = {}): string {
  const key = sportCategoryOrOther(group);
  const url = options.contrast
    ? new URL(`./covers/outline/${key}.svg`, import.meta.url)
    : new URL(`./covers/${key}.svg`, import.meta.url);
  return url.href;
}

export function coverAlt(group: string | null | undefined): string {
  return SPORT_CATEGORY_TITLES[sportCategoryOrOther(group)];
}

export function iconPath(name: IconName): string {
  return `icons/${name}.svg`;
}

export function iconUrl(name: IconName): string {
  return new URL(`./icons/${name}.svg`, import.meta.url).href;
}
