import { describe, expect, it } from 'vitest';
import {
  SPORT_NAME_MAX_LENGTH,
  cleanSportName,
  isValidSportName,
  normalizeSportName,
} from '../src';

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
  it.each([
    'Падел',
    'Кёрлинг на льду',
    'Футбол 7×7',
    'Тай-бо',
    'BMX',
    'Скандинавская ходьба',
    'Джиу-джитсу',
    "Rock'n'roll",
    'Pétanque',
    'Тхэквондо (ВТФ)',
    'BMX-трек',
    'Фрисби Ultimate',
    'Регби 7 (Sevens)',
    'Бег 5K',
    // «Широкие» цифры NFKC приводит к обычным
    'Футбол ７×７',
    // Ударение над кириллицей не составляется в одну букву и остаётся одним знаком
    `Па${String.fromCodePoint(0x301)}дел`,
  ])('«%s» — допустимо', (name) => {
    expect(isValidSportName(name)).toBe(true);
  });

  it.each([
    ['невидимый пробел нулевой ширины', 'Про\u200bбный'],
    ['соединитель нулевой ширины', 'Про\u200dбный'],
    ['знак слова U+2060', 'Про\u2060бный'],
    ['переворот направления текста U+202E', '\u202eйынборП'],
    ['управляющий символ', 'Про\u0007бный'],
    ['combining grapheme joiner U+034F', `Скры${String.fromCodePoint(0x34f)}тый`],
    ['хангыльский заполнитель U+3164', `Скры${String.fromCodePoint(0x3164)}тый`],
    ['селектор варианта U+FE0F', `Скрытый${String.fromCodePoint(0xfe0f)}`],
    ['два комбинируемых знака подряд', `Па${String.fromCodePoint(0x300, 0x301)}дел`],
    ['«залго»: 30 знаков зачёркивания', `Скрытый${String.fromCodePoint(0x336).repeat(30)}`],
    ['латинская C в кириллическом слове', 'Cкрытый'],
    ['латинская a в кириллическом слове', 'Пaдел'],
    ['кириллическая о в латинском слове', 'Bоccia'],
    ['греческая омикрон в кириллическом слове', 'Футбοл'],
    ['киданьский заполнитель U+16FE4', `Скры${String.fromCodePoint(0x16fe4)}тый`],
    ['цифра телугу U+0C66 вместо «о»', `Футб${String.fromCodePoint(0xc66)}л`],
    ['цифра деванагари U+0966 вместо «о»', `Футб${String.fromCodePoint(0x966)}л`],
    ['знак в начале', '-Падел'],
    ['угловые скобки', '<b>Падел</b>'],
  ])('%s — недопустимо', (_, name) => {
    expect(isValidSportName(name)).toBe(false);
  });

  it(`не длиннее ${SPORT_NAME_MAX_LENGTH} символов`, () => {
    expect(isValidSportName('Ф'.repeat(SPORT_NAME_MAX_LENGTH))).toBe(true);
    expect(isValidSportName('Ф'.repeat(SPORT_NAME_MAX_LENGTH + 1))).toBe(false);
  });

  it('длинная строка отвергается сразу, без медленных проверок', () => {
    const started = performance.now();
    expect(isValidSportName('Скрытый'.repeat(3000))).toBe(false);
    expect(performance.now() - started).toBeLessThan(200);
  });
});
