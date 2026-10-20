import { IsOptional, IsString, MaxLength } from 'class-validator';
import { multiLine, trimText } from '../../core/validation';

export const ANSWER_MAX_LENGTH = 1000;

/** Запись или заявка (ТЗ 2.4): ответ — только на вопрос организатора, если он задан. */
export class JoinDto {
  @IsOptional()
  @trimText()
  @multiLine()
  @MaxLength(ANSWER_MAX_LENGTH, { message: `Ответ — до ${ANSWER_MAX_LENGTH} символов` })
  @IsString({ message: 'Ответ — текст' })
  answer?: string;
}
