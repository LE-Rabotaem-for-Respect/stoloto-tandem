import { applyDecorators } from '@nestjs/common';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
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

export const MODERATION_ACTIONS = ['hide', 'delete'] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

const REASON_REQUIRED = 'Укажите причину';

/** Решение администратора по сообщению (ТЗ 2.7, 2.10): скрыть или удалить — с причиной. */
export class ModerateMessageDto {
  @IsIn(MODERATION_ACTIONS, { message: 'Выберите: скрыть или удалить' })
  action!: ModerationAction;

  @trimText()
  @IsString({ message: REASON_REQUIRED })
  @IsNotEmpty({ message: REASON_REQUIRED })
  @MaxLength(500, { message: 'Причина — до 500 символов' })
  @multiLine()
  reason!: string;
}
