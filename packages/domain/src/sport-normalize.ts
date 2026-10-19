/**
 * Имя направления для сравнения и уникальности (`Sport.normalized_name`):
 * без пробелов по краям, с одним пробелом между словами, в нижнем регистре,
 * «ё» заменена на «е». Поэтому «Падел» и «падел » не создают дубль.
 */
export function normalizeSportName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase().replaceAll('ё', 'е');
}
