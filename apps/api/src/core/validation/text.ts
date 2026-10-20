import {
  MULTI_LINE_TEXT,
  SINGLE_LINE_TEXT,
  cleanSingleLine,
  normalizeLineBreaks,
} from '@tandem/domain';
import { Transform } from 'class-transformer';
import { Matches } from 'class-validator';

/** Однострочный текст: в форме NFC, без пробелов по краям и мягких переносов (`cleanSingleLine`). */
export const trimLine = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? cleanSingleLine(value) : value,
  );

/** Многострочный текст: переводы строк Windows (`\r\n`) — к `\n`, пробелы по краям — прочь. */
export const trimText = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeLineBreaks(value).trim() : value,
  );

// Невидимые и переворачивающие текст символы запрещены (правило — в @tandem/domain)
const HIDDEN_CHARS = 'В тексте есть недопустимые символы';
export const singleLine = () => Matches(SINGLE_LINE_TEXT, { message: HIDDEN_CHARS });
export const multiLine = () => Matches(MULTI_LINE_TEXT, { message: HIDDEN_CHARS });
