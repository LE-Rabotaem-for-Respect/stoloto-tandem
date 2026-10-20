import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsUUID } from 'class-validator';

export class MarkReadDto {
  /** Без списка — прочитаны все. */
  @IsOptional()
  @IsArray({ message: 'Передайте список уведомлений' })
  @ArrayMaxSize(100, { message: 'Не больше 100 уведомлений за раз' })
  @IsUUID('all', { each: true, message: 'Неверный номер уведомления' })
  @Type(() => String)
  ids?: string[];
}
