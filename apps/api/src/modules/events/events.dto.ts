import { EVENT_LEVELS, EVENT_MODES } from '@tandem/domain';
import type { EventLevel, EventMode } from '@tandem/domain';
import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { NewSportDto } from '../sports/sports.dto';

const trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

// Время приходит строкой ISO 8601 с поясом; «2026-10-21» без времени — не дата начала
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const isoDate = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && ISO_WITH_ZONE.test(value) ? new Date(value) : value,
  );

/**
 * Создание мероприятия (ТЗ 2.2). Организатор не вводится — его задаёт аккаунт.
 * Направление — либо `sportId` из подсказок, либо `newSport` («Добавить как новое»).
 * Из условий участия в P0 — только уровень.
 */
export class CreateEventDto {
  @trim()
  @IsString({ message: 'Укажите название' })
  @Length(5, 80, { message: 'Название — от 5 до 80 символов' })
  title!: string;

  @trim()
  @IsString({ message: 'Добавьте описание' })
  @IsNotEmpty({ message: 'Добавьте описание' })
  @MaxLength(2000, { message: 'Описание — не длиннее 2000 символов' })
  description!: string;

  @ValidateIf((dto: CreateEventDto) => dto.newSport === undefined)
  @IsUUID('all', { message: 'Выберите направление из списка или добавьте новое' })
  sportId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => NewSportDto)
  newSport?: NewSportDto;

  @isoDate()
  @IsDate({ message: 'Укажите дату и время начала' })
  startsAt!: Date;

  @isoDate()
  @IsDate({ message: 'Укажите дату и время окончания' })
  endsAt!: Date;

  @trim()
  @IsString({ message: 'Укажите город' })
  @Length(2, 80, { message: 'Город — от 2 до 80 символов' })
  city!: string;

  @trim()
  @IsString({ message: 'Укажите район или ориентир' })
  @Length(2, 120, { message: 'Район или ориентир — от 2 до 120 символов' })
  area!: string;

  @trim()
  @IsString({ message: 'Укажите адрес или опишите место' })
  @Length(3, 300, { message: 'Адрес или описание места — от 3 до 300 символов' })
  placeText!: string;

  @IsOptional()
  @trim()
  @IsString({ message: 'Информация для участников — текст' })
  @MaxLength(2000, { message: 'Информация для участников — не длиннее 2000 символов' })
  participantInfo?: string;

  @IsIn(EVENT_MODES, { message: 'Выберите режим записи' })
  mode!: EventMode;

  @IsOptional()
  @trim()
  @IsString({ message: 'Вопрос к заявке — текст' })
  @MaxLength(300, { message: 'Вопрос к заявке — не длиннее 300 символов' })
  applyQuestion?: string;

  @IsIn(EVENT_LEVELS, { message: 'Выберите уровень' })
  level!: EventLevel;
}
