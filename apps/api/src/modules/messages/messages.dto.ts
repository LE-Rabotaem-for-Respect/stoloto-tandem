import { applyDecorators } from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { multiLine, trimText } from '../../core/validation';

export const MESSAGE_MAX_LENGTH = 2000;

const TEXT_REQUIRED = 'Напишите сообщение';

// Как тексты мероприятия. В applyDecorators ограничения проверяются в порядке записи:
// сначала «Напишите сообщение», потом длина, «недопустимые символы» — последними
const messageText = () =>
  applyDecorators(
    trimText(),
    IsString({ message: TEXT_REQUIRED }),
    IsNotEmpty({ message: TEXT_REQUIRED }),
    MaxLength(MESSAGE_MAX_LENGTH, { message: `Сообщение — до ${MESSAGE_MAX_LENGTH} символов` }),
    multiLine(),
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
