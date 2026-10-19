import { MULTI_LINE_TEXT, normalizeLineBreaks } from '@tandem/domain';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export const ANSWER_MAX_LENGTH = 1000;

/** Запись или заявка (ТЗ 2.4): ответ — только на вопрос организатора, если он задан. */
export class JoinDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeLineBreaks(value).trim() : value,
  )
  @IsString({ message: 'Ответ — текст' })
  @MaxLength(ANSWER_MAX_LENGTH, { message: `Ответ — до ${ANSWER_MAX_LENGTH} символов` })
  @Matches(MULTI_LINE_TEXT, { message: 'В тексте есть недопустимые символы' })
  answer?: string;
}
