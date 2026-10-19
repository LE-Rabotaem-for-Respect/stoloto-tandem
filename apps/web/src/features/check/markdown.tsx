import type { ReactNode } from 'react';

export type MarkdownBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'table'; head: string[]; rows: string[][] };

const LIST_ITEM = /^[-*]\s+(.*)$/;
const isTableRow = (line: string) => line.trim().startsWith('|');
const isTableDivider = (line: string) => /^\|?[\s|:-]+\|?$/.test(line.trim());

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replaceAll('\\|', '|'));

/**
 * Разбор той Markdown-разметки, что есть в `docs/scenarios.md`: заголовки,
 * абзацы, списки, таблицы. HTML из документа не исполняется — всё становится
 * текстом React.
 */
export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.split(/\r?\n/);
  const at = (index: number) => lines[index] ?? '';
  const blocks: MarkdownBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = at(i);
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (!line.trim()) {
      i += 1;
    } else if (heading) {
      const [, hashes = '', text = ''] = heading;
      blocks.push({ type: 'heading', level: hashes.length, text: text.trim() });
      i += 1;
    } else if (isTableRow(line)) {
      const rows: string[][] = [];
      for (; i < lines.length && isTableRow(at(i)); i += 1) {
        if (!isTableDivider(at(i))) rows.push(cells(at(i)));
      }
      blocks.push({ type: 'table', head: rows[0] ?? [], rows: rows.slice(1) });
    } else if (LIST_ITEM.test(line)) {
      const items: string[] = [];
      for (; i < lines.length && at(i).trim(); i += 1) {
        const item = LIST_ITEM.exec(at(i));
        if (item) items.push(item[1] ?? '');
        else if (items.length) items.push(`${items.pop() ?? ''} ${at(i).trim()}`);
      }
      blocks.push({ type: 'list', items });
    } else {
      const text: string[] = [];
      for (; i < lines.length && at(i).trim() && !/^(#|\||[-*]\s)/.test(at(i)); i += 1) {
        text.push(at(i).trim());
      }
      blocks.push({ type: 'paragraph', text: text.join(' ') });
    }
  }
  return blocks;
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={index}>{part.slice(1, -1)}</code>;
    return part;
  });
}

function Heading({ level, children }: { level: number; children: ReactNode }) {
  const Tag = `h${Math.min(level, 6)}` as 'h1';
  return <Tag>{children}</Tag>;
}

export function Markdown({ source }: { source: string }) {
  return parseMarkdown(source).map((block, index) => {
    switch (block.type) {
      case 'heading':
        return (
          <Heading key={index} level={block.level}>
            <Inline text={block.text} />
          </Heading>
        );
      case 'paragraph':
        return (
          <p key={index}>
            <Inline text={block.text} />
          </p>
        );
      case 'list':
        return (
          <ul key={index}>
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                <Inline text={item} />
              </li>
            ))}
          </ul>
        );
      case 'table':
        return (
          <div key={index} className="markdown-table">
            <table>
              <thead>
                <tr>
                  {block.head.map((cell, cellIndex) => (
                    <th key={cellIndex} scope="col">
                      <Inline text={cell} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex}>
                        <Inline text={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
    }
  });
}
