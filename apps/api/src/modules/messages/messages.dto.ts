import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { multiLine, trim } from '../events/events.dto';

export const MESSAGE_MAX_LENGTH = 2000;

const TEXT_REQUIRED = 'Напишите сообщение';

/** Сообщение обсуждения (ТЗ 2.7): вопрос или ответ на сообщение верхнего уровня. */
export class CreateMessageDto {
  @trim()
  @IsString({ message: TEXT_REQUIRED })
  @IsNotEmpty({ message: TEXT_REQUIRED })
  @MaxLength(MESSAGE_MAX_LENGTH, { message: `Сообщение — до ${MESSAGE_MAX_LENGTH} символов` })
  @multiLine()
  text!: string;

  @IsOptional()
  @IsUUID('all', { message: 'Выберите сообщение, на которое отвечаете' })
  parentId?: string;
}

export class EditMessageDto {
  @trim()
  @IsString({ message: TEXT_REQUIRED })
  @IsNotEmpty({ message: TEXT_REQUIRED })
  @MaxLength(MESSAGE_MAX_LENGTH, { message: `Сообщение — до ${MESSAGE_MAX_LENGTH} символов` })
  @multiLine()
  text!: string;
}
