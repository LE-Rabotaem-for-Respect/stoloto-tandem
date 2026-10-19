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

export const SPORT_NAME_MAX_LENGTH = 50;

// Длина — первой: проверки ниже на длинной строке медленные (квадратичные).
const MAX_LENGTH = `(?=.{1,${SPORT_NAME_MAX_LENGTH}}$)`;
// Невидимые символы: управляющие (U+200B, U+202E) и те, что Unicode считает
// буквами или знаками, но не показывает (Default_Ignorable: U+034F, U+3164,
// U+FE0F; и заполнитель U+16FE4).
const NO_INVISIBLE = String.raw`(?!.*[\p{DI}\u{16FE4}])`;
// Подряд — не больше двух комбинируемых знаков.
const NO_COMBINING_RUNS = String.raw`(?!.*\p{M}{3})`;
// Похожие буквы разных алфавитов в одном слове (латинская C и кириллическая С,
// греческая ο и кириллическая о): на вид то же название, а имя для сравнения другое.
const WORD = String.raw`[\p{L}\p{M}]*`;
const NO_MIXED_SCRIPTS = String.raw`(?!.*(?:\p{sc=Latin}${WORD}[\p{sc=Cyrillic}\p{sc=Greek}]|\p{sc=Cyrillic}${WORD}[\p{sc=Latin}\p{sc=Greek}]|\p{sc=Greek}${WORD}[\p{sc=Latin}\p{sc=Cyrillic}]))`;
const ALLOWED = String.raw`[\p{L}\p{N}][\p{L}\p{M}\p{N} .,'’()×/+–-]*`;

/**
 * Допустимое очищенное название: буквы, цифры, пробелы и немного знаков,
 * без невидимых символов и без смешения алфавитов в одном слове. Иначе ими
 * обходят скрытие направления и правило «без дублей».
 */
export const SPORT_NAME_PATTERN = new RegExp(
  `^${MAX_LENGTH}${NO_INVISIBLE}${NO_COMBINING_RUNS}${NO_MIXED_SCRIPTS}${ALLOWED}$`,
  'u',
);

export const isValidSportName = (name: string): boolean =>
  SPORT_NAME_PATTERN.test(cleanSportName(name));
