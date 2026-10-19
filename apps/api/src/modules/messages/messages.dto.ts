import { applyDecorators } from '@nestjs/common';
import { MULTI_LINE_TEXT, normalizeLineBreaks } from '@tandem/domain';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export const MESSAGE_MAX_LENGTH = 2000;

const TEXT_REQUIRED = 'Напишите сообщение';

// Как тексты мероприятия: переводы строк — к \n, пробелы по краям — прочь, правило — из domain
const messageText = () =>
  applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? normalizeLineBreaks(value).trim() : value,
    ),
    IsString({ message: TEXT_REQUIRED }),
    IsNotEmpty({ message: TEXT_REQUIRED }),
    MaxLength(MESSAGE_MAX_LENGTH, { message: `Сообщение — до ${MESSAGE_MAX_LENGTH} символов` }),
    Matches(MULTI_LINE_TEXT, { message: 'В тексте есть недопустимые символы' }),
  );

/** Сообщение обсуждения (ТЗ 2.7): вопрос или ответ на сообщение верхнего уровня. */
export class CreateMessageDto {
  @messageText()
  text!: string;

  @IsOptional()
  @IsUUID('all', { message: 'Выберите сообщение, на которое отвечаете' })
  parentId?: string;
}

export class EditMessageDto {
  @messageText()
  text!: string;
}
