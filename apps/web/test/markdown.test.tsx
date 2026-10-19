import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Markdown, parseMarkdown } from '../src/features/check/markdown';

afterEach(cleanup);

describe('показ docs/scenarios.md', () => {
  it('разбирает заголовки, абзацы, списки и таблицы', () => {
    const blocks = parseMarkdown(
      [
        '# Сценарии',
        '',
        'Первая строка',
        'и её продолжение.',
        '',
        '- раз',
        '- два',
        '',
        '| №   | Роль |',
        '| --- | ---- |',
        '| 1   | Анна |',
      ].join('\n'),
    );
    expect(blocks).toEqual([
      { type: 'heading', level: 1, text: 'Сценарии' },
      { type: 'paragraph', text: 'Первая строка и её продолжение.' },
      { type: 'list', items: ['раз', 'два'] },
      { type: 'table', head: ['№', 'Роль'], rows: [['1', 'Анна']] },
    ]);
  });

  it('показывает таблицу таблицей, код и жирный текст — разметкой, а не символами', () => {
    render(
      <Markdown
        source={[
          '### Сценарий 6',
          '',
          '**Ветка одобрения** — вход `padel@demo`',
          '',
          '| Роль | Действие |',
          '| ---- | -------- |',
          '| Анна | «Записаться» |',
        ].join('\n')}
      />,
    );
    expect(screen.getByRole('heading', { level: 3, name: 'Сценарий 6' })).toBeTruthy();
    expect(screen.getByText('Ветка одобрения').tagName).toBe('STRONG');
    expect(screen.getByText('padel@demo').tagName).toBe('CODE');
    const table = screen.getByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Роль', 'Действие']);
    expect(within(table).getByRole('cell', { name: '«Записаться»' })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\*\*|`|\|/);
  });

  it('разметку HTML в документе показывает текстом', () => {
    render(<Markdown source={'<img src=x onerror="alert(1)">'} />);
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeTruthy();
  });
});
