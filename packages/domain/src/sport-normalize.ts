/**
 * Название направления для показа: в форме NFKC (составные буквы вроде «й» —
 * одним символом, «широкие» и стилизованные — обычными), без пробелов по краям
 * и с одним пробелом между словами.
 */
export function cleanSportName(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

/**
 * Имя направления для сравнения и уникальности (`Sport.normalized_name`):
 * очищенное название в нижнем регистре, «ё» заменена на «е».
 * Поэтому «Падел» и «падел » не создают дубль.
 */
export function normalizeSportName(name: string): string {
  return cleanSportName(name).toLowerCase().replaceAll('ё', 'е');
}

/**
 * Допустимое очищенное название: буквы, цифры, пробелы и немного знаков.
 * Невидимые и управляющие символы (U+200B, U+202E и т. п.) не проходят:
 * иначе ими обходят скрытие направления и правило «без дублей».
 */
export const SPORT_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} .,'’()×/+–-]*$/u;

export const isValidSportName = (name: string): boolean =>
  SPORT_NAME_PATTERN.test(cleanSportName(name));
