import {
  MULTI_LINE_TEXT,
  SINGLE_LINE_TEXT,
  VISIBLE_TEXT,
  cleanSingleLine,
  normalizeLineBreaks,
} from '@tandem/domain';
import { Transform } from 'class-transformer';
import { Matches } from 'class-validator';

// Правила текста пользователя — в @tandem/domain; здесь — одни и те же декораторы для всех
// модулей api. Сообщение выбирается по первому нарушенному ограничению снизу, поэтому в поле
// сверху вниз: преобразование, проверки символов, длина, IsString. Для не-строки человек
// видит «Укажите …», для короткой строки — про длину, а «недопустимые символы» — только
// когда остальное в порядке.

/** Однострочный текст: пробелы по краям и мягкие переносы — прочь, иначе слово не найдётся поиском. */
export const cleanLine = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? cleanSingleLine(value) : value,
  );

/** Многострочный текст: переводы строк Windows (`\r\n`) — к `\n`, пробелы по краям — прочь. */
export const trimText = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeLineBreaks(value).trim() : value,
  );

// Невидимые и переворачивающие текст символы запрещены
const HIDDEN_CHARS = 'В тексте есть недопустимые символы';
export const singleLine = () => Matches(SINGLE_LINE_TEXT, { message: HIDDEN_CHARS });
export const multiLine = () => Matches(MULTI_LINE_TEXT, { message: HIDDEN_CHARS });

const VISIBLE_OR_EMPTY = new RegExp(`^$|${VISIBLE_TEXT.source}`, 'u');

/**
 * Строка из точек, тире или одних эмодзи на карточке выглядит пустой. `allowEmpty` — для
 * полей, которые можно очистить: черновик профиля организации заполняется по частям, а
 * пустое поле не отправить на проверку.
 */
export const visible = ({ allowEmpty = false } = {}) =>
  Matches(allowEmpty ? VISIBLE_OR_EMPTY : VISIBLE_TEXT, {
    message: 'Нужна хотя бы одна буква или цифра',
  });
