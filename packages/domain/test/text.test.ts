import { describe, expect, it } from 'vitest';
import { MULTI_LINE_TEXT, SINGLE_LINE_TEXT, normalizeLineBreaks } from '../src';

const char = (...codePoints: number[]) => String.fromCodePoint(...codePoints);
const LF = char(10);
const CR = char(13);
const TAB = char(9);

describe('SINGLE_LINE_TEXT и MULTI_LINE_TEXT', () => {
  it.each([
    ['обычный текст', 'Футбол 7×7 у школы № 12'],
    [
      'составной эмодзи: соединитель и селектор начертания',
      `Бег ${char(0x1f3c3, 0x200d, 0x2640, 0xfe0f)}`,
    ],
    ['флаг из региональных букв', `Сборная ${char(0x1f1f7, 0x1f1fa)}`],
    ['мягкий перенос', `Пробеж${char(0xad)}ка`],
    ['пустая строка', ''],
  ])('пропускают: %s', (_, text) => {
    expect(SINGLE_LINE_TEXT.test(text)).toBe(true);
    expect(MULTI_LINE_TEXT.test(text)).toBe(true);
  });

  it.each([
    ['невидимый математический оператор U+2063', 0x2063],
    ['тег U+E0041', 0xe0041],
    ['заполнитель хангыля U+3164', 0x3164],
    ['заполнитель хангыля U+FFA0', 0xffa0],
    ['подстрочная аннотация U+FFF9', 0xfff9],
    ['разделитель строк U+2028', 0x2028],
    ['разделитель абзацев U+2029', 0x2029],
    ['переворот текста U+202E', 0x202e],
    ['изоляция направления U+2066', 0x2066],
    ['невидимый пробел U+200B', 0x200b],
    ['несоединитель U+200C', 0x200c],
    ['BOM U+FEFF', 0xfeff],
    ['комбинируемый невидимый U+034F', 0x34f],
    ['монгольский разделитель U+180E', 0x180e],
    ['заполнитель U+16FE4', 0x16fe4],
    ['нулевой байт', 0],
    ['звонок U+0007', 7],
  ])('отклоняют: %s', (_, codePoint) => {
    const text = `Фут${char(codePoint)}бол`;
    expect(SINGLE_LINE_TEXT.test(text)).toBe(false);
    expect(MULTI_LINE_TEXT.test(text)).toBe(false);
  });

  it('перевод строки и табуляция — только в многострочном тексте', () => {
    for (const text of [`Играем${LF}7 на 7`, `Играем${TAB}7 на 7`]) {
      expect(SINGLE_LINE_TEXT.test(text)).toBe(false);
      expect(MULTI_LINE_TEXT.test(text)).toBe(true);
    }
  });

  it('возврат каретки не пропускает ни одно правило', () => {
    expect(SINGLE_LINE_TEXT.test(`а${CR}б`)).toBe(false);
    expect(MULTI_LINE_TEXT.test(`а${CR}б`)).toBe(false);
  });
});

describe('normalizeLineBreaks', () => {
  it('переводы строк Windows и старых Mac становятся одним переводом строки', () => {
    expect(normalizeLineBreaks(`а${CR}${LF}б${CR}в${LF}г`)).toBe(`а${LF}б${LF}в${LF}г`);
  });
});
