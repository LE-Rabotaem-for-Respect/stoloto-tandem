import { describe, expect, it } from 'vitest';
import { cleanSportName, isValidSportName, normalizeSportName } from '../src';

describe('normalizeSportName', () => {
  it('обрезает пробелы по краям', () => {
    expect(normalizeSportName('  падел ')).toBe('падел');
  });

  it('схлопывает повторные пробелы, табуляции и переводы строк', () => {
    expect(normalizeSportName('настольный   \t теннис\nв парке')).toBe('настольный теннис в парке');
  });

  it('приводит к нижнему регистру', () => {
    expect(normalizeSportName('Падел')).toBe('падел');
    expect(normalizeSportName('ФРИСБИ')).toBe('фрисби');
  });

  it('заменяет ё на е в любом регистре', () => {
    expect(normalizeSportName('Ёга на свёкле')).toBe('ега на свекле');
  });

  it('«Падел» и «падел » дают одно и то же имя', () => {
    expect(normalizeSportName('Падел')).toBe(normalizeSportName('падел '));
  });

  it('пустая строка и строка из пробелов дают пустую строку', () => {
    expect(normalizeSportName('')).toBe('');
    expect(normalizeSportName('   ')).toBe('');
  });

  it('разложенная «й» (и + знак) совпадает с обычной', () => {
    expect(normalizeSportName('Пробны\u0438\u0306')).toBe(normalizeSportName('Пробный'));
  });

  it('«широкие» буквы приводятся к обычным', () => {
    expect(normalizeSportName('ＢＭＸ')).toBe('bmx');
  });
});

describe('cleanSportName', () => {
  it('сохраняет регистр и «ё», убирает лишние пробелы', () => {
    expect(cleanSportName('  Кёрлинг   на льду ')).toBe('Кёрлинг на льду');
  });
});

describe('isValidSportName', () => {
  it.each(['Падел', 'Кёрлинг на льду', 'Футбол 7×7', 'Тай-бо', 'BMX', 'Скандинавская ходьба'])(
    '«%s» — допустимо',
    (name) => {
      expect(isValidSportName(name)).toBe(true);
    },
  );

  it.each([
    ['невидимый пробел нулевой ширины', 'Про\u200bбный'],
    ['соединитель нулевой ширины', 'Про\u200dбный'],
    ['знак слова U+2060', 'Про\u2060бный'],
    ['переворот направления текста U+202E', '\u202eйынборП'],
    ['управляющий символ', 'Про\u0007бный'],
    ['знак в начале', '-Падел'],
    ['угловые скобки', '<b>Падел</b>'],
  ])('%s — недопустимо', (_, name) => {
    expect(isValidSportName(name)).toBe(false);
  });
});
