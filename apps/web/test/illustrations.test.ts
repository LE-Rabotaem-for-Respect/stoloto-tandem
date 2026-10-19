import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPORT_CATEGORIES, SPORT_CATEGORY_TITLES } from '@tandem/domain';
import { describe, expect, it } from 'vitest';
import * as illustrations from '../src/shared/illustrations';
import {
  ICONS,
  coverAlt,
  coverPath,
  coverUrl,
  iconPath,
  iconUrl,
  sportCategoryOrOther,
} from '../src/shared/illustrations';

const root = join(dirname(fileURLToPath(import.meta.url)), '../src/shared/illustrations');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const svgFiles = (dir: string) =>
  readdirSync(join(root, dir))
    .filter((name) => name.endsWith('.svg'))
    .map((name) => name.replace(/\.svg$/, ''))
    .sort();

const MAX_BYTES = 4096;

// Сборщик отдаёт мелкие SVG как data:-URI, крупные — ссылкой на файл.
// Проверяем, что по адресу лежит именно нужный файл.
function expectUrlServes(url: string, path: string) {
  const prefix = 'data:image/svg+xml,';
  if (url.startsWith(prefix)) {
    const normalize = (text: string) => text.trim().replaceAll('"', "'");
    expect(normalize(decodeURIComponent(url.slice(prefix.length)))).toBe(normalize(read(path)));
  } else {
    expect(url.endsWith(path)).toBe(true);
  }
}

function expectSafeLightSvg(path: string) {
  const svg = read(path);
  expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="')).toBe(true);
  expect(statSync(join(root, path)).size).toBeLessThanOrEqual(MAX_BYTES);
  expect(svg).not.toMatch(/<script|<image|<foreignObject|href=|\son[a-z]+=|\sstyle=/i);
}

const SHAPE = /<(path|rect|circle|ellipse|polygon|polyline|line)\b[^>]*>/g;

describe('группы направлений', () => {
  it('ключи групп — из SPORT_CATEGORIES (@tandem/domain), своего списка нет', () => {
    expect(illustrations).not.toHaveProperty('SPORT_GROUPS');
    expect(illustrations).not.toHaveProperty('SPORT_GROUP_TITLES');
    for (const category of SPORT_CATEGORIES) {
      expect(sportCategoryOrOther(category)).toBe(category);
      expect(coverAlt(category)).toBe(SPORT_CATEGORY_TITLES[category]);
    }
  });

  it('ключи api: интеллектуальные и единоборства — intellectual и martial', () => {
    expect(coverPath('intellectual')).toBe('covers/intellectual.svg');
    expect(coverPath('martial', { contrast: true })).toBe('covers/outline/martial.svg');
    expect(coverAlt('intellectual')).toBe('Интеллектуальные');
    expect(coverAlt('martial')).toBe('Единоборства');
    expect(sportCategoryOrOther('mind')).toBe('other');
    expect(sportCategoryOrOther('combat')).toBe('other');
  });

  it('неизвестная, пустая или скрытая группа показывается как «Другое»', () => {
    expect(sportCategoryOrOther('water')).toBe('water');
    expect(sportCategoryOrOther('petanque')).toBe('other');
    expect(sportCategoryOrOther('')).toBe('other');
    expect(sportCategoryOrOther(null)).toBe('other');
    expect(sportCategoryOrOther(undefined)).toBe('other');
    expect(coverPath('petanque')).toBe('covers/other.svg');
    expect(coverAlt(undefined)).toBe('Другое');
  });

  it('контрастная тема получает контурную обложку', () => {
    expect(coverPath('winter')).toBe('covers/winter.svg');
    expect(coverPath('winter', { contrast: true })).toBe('covers/outline/winter.svg');
    expectUrlServes(coverUrl('winter', { contrast: true }), 'covers/outline/winter.svg');
    expectUrlServes(coverUrl('winter'), 'covers/winter.svg');
    expectUrlServes(coverUrl('petanque'), 'covers/other.svg');
  });
});

describe('файлы обложек', () => {
  it('есть цветная и контурная обложка для каждой группы и нет лишних', () => {
    expect(svgFiles('covers')).toEqual([...SPORT_CATEGORIES].sort());
    expect(svgFiles('covers/outline')).toEqual([...SPORT_CATEGORIES].sort());
  });

  it.each(SPORT_CATEGORIES)('%s: один формат кадра, лёгкие, без внешних ресурсов', (group) => {
    for (const contrast of [false, true]) {
      const path = coverPath(group, { contrast });
      expectSafeLightSvg(path);
      expect(read(path)).toContain('viewBox="0 0 320 180"');
    }
  });

  it.each(SPORT_CATEGORIES)('%s: контурная версия без заливок и полупрозрачности', (group) => {
    const svg = read(coverPath(group, { contrast: true }));
    expect(svg).not.toMatch(/opacity|rgba|hsla|#[0-9a-f]{8}\b|#[0-9a-f]{4}\b/i);
    // Без атрибута fill фигура залилась бы чёрным, поэтому он обязателен у каждой
    const shapes = [...svg.matchAll(SHAPE)].map((m) => m[0]);
    expect(shapes.length).toBeGreaterThan(0);
    expect(shapes.every((shape) => shape.includes('fill="none"'))).toBe(true);
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
    expect(svg).toMatch(/^<svg [^>]*fill="none"/);
    expect(svg).not.toMatch(/opacity|#[0-9a-f]{3,8}\b|rgb|hsl/i);
    const shapes = [...svg.matchAll(SHAPE)].map((m) => m[0]);
    expect(shapes.every((shape) => !/\sfill="(?!none")/.test(shape))).toBe(true);
    expectUrlServes(iconUrl(name), path);
  });
});
