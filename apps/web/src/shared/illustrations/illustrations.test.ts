import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ICONS,
  SPORT_GROUPS,
  SPORT_GROUP_TITLES,
  coverAlt,
  coverPath,
  coverUrl,
  iconPath,
  iconUrl,
  sportGroupOrOther,
} from './index';

const root = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const svgFiles = (dir: string) =>
  readdirSync(join(root, dir))
    .filter((name) => name.endsWith('.svg'))
    .map((name) => name.replace(/\.svg$/, ''))
    .sort();

const MAX_BYTES = 4096;

function expectSafeLightSvg(path: string) {
  const svg = read(path);
  expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="')).toBe(true);
  expect(statSync(join(root, path)).size).toBeLessThanOrEqual(MAX_BYTES);
  expect(svg).not.toMatch(/<script|<image|<foreignObject|href=|\son[a-z]+=/i);
}

describe('группы направлений', () => {
  it('восемь групп из ТЗ, у каждой есть название', () => {
    expect(SPORT_GROUPS).toHaveLength(8);
    for (const group of SPORT_GROUPS) expect(SPORT_GROUP_TITLES[group]).toBeTruthy();
  });

  it('неизвестная, пустая или скрытая группа показывается как «Другое»', () => {
    expect(sportGroupOrOther('water')).toBe('water');
    expect(sportGroupOrOther('petanque')).toBe('other');
    expect(sportGroupOrOther('')).toBe('other');
    expect(sportGroupOrOther(null)).toBe('other');
    expect(sportGroupOrOther(undefined)).toBe('other');
    expect(coverPath('petanque')).toBe('covers/other.svg');
    expect(coverAlt(undefined)).toBe('Другое');
  });

  it('контрастная тема получает контурную обложку', () => {
    expect(coverPath('winter')).toBe('covers/winter.svg');
    expect(coverPath('winter', { contrast: true })).toBe('covers/outline/winter.svg');
    expect(coverUrl('winter', { contrast: true })).toMatch(/covers\/outline\/winter\.svg$/);
    expect(coverUrl('winter')).toMatch(/covers\/winter\.svg$/);
  });
});

describe('файлы обложек', () => {
  it('есть цветная и контурная обложка для каждой группы и нет лишних', () => {
    expect(svgFiles('covers')).toEqual([...SPORT_GROUPS].sort());
    expect(svgFiles('covers/outline')).toEqual([...SPORT_GROUPS].sort());
  });

  it.each(SPORT_GROUPS)('%s: один формат кадра, лёгкие, без внешних ресурсов', (group) => {
    for (const contrast of [false, true]) {
      const path = coverPath(group, { contrast });
      expectSafeLightSvg(path);
      expect(read(path)).toContain('viewBox="0 0 320 180"');
    }
  });

  it.each(SPORT_GROUPS)('%s: контурная версия без заливок и полупрозрачности', (group) => {
    const svg = read(coverPath(group, { contrast: true }));
    expect(svg).not.toMatch(/opacity|rgba|hsla|#[0-9a-f]{8}\b|#[0-9a-f]{4}\b/i);
    const fills = [...svg.matchAll(/fill="([^"]*)"/g)].map((m) => m[1]);
    expect(fills.every((fill) => fill === 'none')).toBe(true);
    const strokes = [...svg.matchAll(/stroke="([^"]*)"/g)].map((m) => m[1]);
    expect(strokes.length).toBeGreaterThan(0);
    expect(strokes.every((stroke) => stroke === 'currentColor')).toBe(true);
  });
});

describe('пиктограммы', () => {
  it('файлы совпадают со списком', () => {
    expect(svgFiles('icons')).toEqual([...ICONS].sort());
  });

  it.each(ICONS)('%s: контур 24×24 цветом текста', (name) => {
    const path = iconPath(name);
    expectSafeLightSvg(path);
    const svg = read(path);
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).not.toMatch(/opacity|#[0-9a-f]{3,8}\b|rgb|hsl/i);
    expect(iconUrl(name)).toMatch(new RegExp(`icons/${name}\\.svg$`));
  });
});
