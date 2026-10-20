import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, '../src/shared/theme/base.css'), 'utf8');

// Правила base.css: селекторы → объявления (комментарии убраны)
function rules(source: string): { selectors: string[]; body: string }[] {
  return [...source.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)].map(
    (match) => ({
      selectors: (match[1] ?? '').split(',').map((selector) => selector.trim()),
      body: match[2] ?? '',
    }),
  );
}

describe('заголовки с длинным словом не дают горизонтальной прокрутки', () => {
  it.each(['h1', 'h2', 'h3'])('%s переносит длинное слово', (tag) => {
    const declarations = rules(css)
      .filter((rule) => rule.selectors.includes(tag))
      .map((rule) => rule.body)
      .join(';');
    expect(declarations).toMatch(/overflow-wrap:\s*anywhere/);
    expect(declarations).toMatch(/hyphens:\s*auto/);
  });
});
