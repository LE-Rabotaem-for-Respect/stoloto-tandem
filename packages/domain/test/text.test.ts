import { describe, expect, it } from 'vitest';
import {
  MULTI_LINE_TEXT,
  SINGLE_LINE_TEXT,
  VISIBLE_TEXT,
  cleanSingleLine,
  normalizeLineBreaks,
} from '../src';

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

describe('комбинирующие знаки в однострочном тексте — по одному после буквы', () => {
  it.each([
    ['разложенная «й»: и + U+0306', `Хоккей на тра${char(0x438, 0x306)}ве`],
    ['разложенная «ё»: е + U+0308', `Е${char(0x308)}лка`],
    ['ударение над буквой', `Кубо${char(0x301)}к`],
    ['keycap с селектором', `Шаг ${char(0x31, 0xfe0f, 0x20e3)}`],
    ['keycap без селектора', `Шаг ${char(0x23, 0x20e3)}`],
  ])('пропускают: %s', (_, text) => {
    expect(SINGLE_LINE_TEXT.test(text)).toBe(true);
  });

  it.each([
    ['рамка клавиши внутри слова', `Ку${char(0x20e3)}бок`],
    ['два знака подряд над буквой («залго»)', `Кубо${char(0x301, 0x300)}к`],
    ['знак после пробела', `Кубок ${char(0x301)}`],
    ['знак в начале строки', `${char(0x301)}Кубок`],
    ['знак после цифры', `Кубок 7${char(0x301)}`],
  ])('отклоняют: %s', (_, text) => {
    expect(SINGLE_LINE_TEXT.test(text)).toBe(false);
  });
});

describe('normalizeLineBreaks', () => {
  it('переводы строк Windows и старых Mac становятся одним переводом строки', () => {
    expect(normalizeLineBreaks(`а${CR}${LF}б${CR}в${LF}г`)).toBe(`а${LF}б${LF}в${LF}г`);
  });
});

describe('разрешённые невидимые — только на своём месте', () => {
  it.each([
    ['бегунья: соединитель между эмодзи', char(0x1f3c3, 0x200d, 0x2640, 0xfe0f)],
    ['семья из трёх', char(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f466)],
    ['тон кожи и соединитель', char(0x1f3c3, 0x1f3fd, 0x200d, 0x2642, 0xfe0f)],
    ['keycap', `1${char(0xfe0f, 0x20e3)} место`],
    ['сердце с селектором', `Йога ${char(0x2764, 0xfe0f)}`],
    ['мягкий перенос между буквами', `Пробеж${char(0xad)}ка`],
  ])('пропускают: %s', (_, text) => {
    expect(SINGLE_LINE_TEXT.test(text)).toBe(true);
    expect(MULTI_LINE_TEXT.test(text)).toBe(true);
  });

  it.each([
    ['соединитель внутри слова', `Фут${char(0x200d)}бол`],
    ['соединитель в начале', `${char(0x200d)}Футбол`],
    ['соединитель после эмодзи без второго', `${char(0x1f3c3, 0x200d)} бег`],
    ['селектор после буквы', `Фут${char(0xfe0f)}бол`],
    ['селектор после селектора', `${char(0x2764, 0xfe0f, 0xfe0f)}`],
    ['мягкий перенос в начале слова', `${char(0xad)}Футбол`],
    ['мягкий перенос после пробела', `Футбол ${char(0xad)}`],
    ['пустой символ Брайля U+2800', char(0x2800)],
    ['неназначенный U+0378', `Фут${char(0x378)}бол`],
    ['частный U+E000', `Фут${char(0xe000)}бол`],
    ['несимвол U+FFFE', `Фут${char(0xfffe)}бол`],
    ['несимвол U+10FFFF', `Фут${char(0x10ffff)}бол`],
    ['одиночная суррогатная половина', 'Фут\ud800бол'],
  ])('отклоняют: %s', (_, text) => {
    expect(SINGLE_LINE_TEXT.test(text)).toBe(false);
    expect(MULTI_LINE_TEXT.test(text)).toBe(false);
  });
});

describe('VISIBLE_TEXT: в однострочном поле есть буква или цифра', () => {
  it('пустые на вид строки не проходят', () => {
    for (const text of [char(0xad).repeat(5), '.....', '— — —', `${char(0x1f3c3)}`]) {
      expect(VISIBLE_TEXT.test(text), JSON.stringify(text)).toBe(false);
    }
  });

  it('с буквой или цифрой — проходят', () => {
    for (const text of ['Футбол', '№ 12', `${char(0x1f3c3)} Бег`, 'Café']) {
      expect(VISIBLE_TEXT.test(text)).toBe(true);
    }
  });
});

describe('cleanSingleLine', () => {
  it('мягкий перенос в однострочном тексте убирается: название находится поиском', () => {
    expect(cleanSingleLine(`  Фут${char(0xad)}бол  `)).toBe('Футбол');
  });
});
