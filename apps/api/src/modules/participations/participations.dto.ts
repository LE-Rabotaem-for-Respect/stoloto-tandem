import { IsOptional, IsString, MaxLength } from 'class-validator';
import { multiLine, trim } from '../events/events.dto';

export const ANSWER_MAX_LENGTH = 1000;

/** Запись или заявка (ТЗ 2.4): ответ — только на вопрос организатора, если он задан. */
export class JoinDto {
  @IsOptional()
  @trim()
  @IsString({ message: 'Ответ — текст' })
  @MaxLength(ANSWER_MAX_LENGTH, { message: `Ответ — до ${ANSWER_MAX_LENGTH} символов` })
  @multiLine()
  answer?: string;
}
