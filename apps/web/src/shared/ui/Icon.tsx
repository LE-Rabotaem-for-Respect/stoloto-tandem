import { iconUrl } from '../illustrations';
import type { IconName } from '../illustrations';

/**
 * Пиктограмма цветом текста рядом: SVG служит маской, цвет — `currentColor`,
 * поэтому в контрастной теме инвертировать ничего не нужно. Всегда
 * декоративная — смысл несёт подпись рядом (ТЗ 2.11).
 */
export function Icon({ name }: { name: IconName }) {
  const mask = `url("${iconUrl(name)}")`;
  return (
    <span className="icon" aria-hidden="true" style={{ maskImage: mask, WebkitMaskImage: mask }} />
  );
}
