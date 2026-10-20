import { EVENT_LEVELS, EVENT_MODES, SPORT_CATEGORIES } from '@tandem/domain';
import type { EventLevel, EventMode, SportCategory } from '@tandem/domain';
import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  Equals,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { cleanLine, multiLine, singleLine, trimText, visible } from '../../core/validation';
import { NewSportDto } from '../sports/sports.dto';

// Время приходит строкой ISO 8601 с поясом; «2026-10-21» без времени — не дата начала
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
// new Date молча переносит несуществующий день («30 февраля» → 2 марта): такой день не дата
function existingDay(value: string): boolean {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const isoDate = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && ISO_WITH_ZONE.test(value) && existingDay(value)
      ? new Date(value)
      : value,
  );

/**
 * Создание мероприятия (ТЗ 2.2). Организатор не вводится — его задаёт аккаунт.
 * Направление — либо `sportId` из подсказок, либо `newSport` («Добавить как новое»).
 * Из условий участия в P0 — только уровень.
 */
export class CreateEventDto {
  @cleanLine()
  @visible()
  @singleLine()
  @Length(5, 80, { message: 'Название — от 5 до 80 символов' })
  @IsString({ message: 'Укажите название' })
  title!: string;

  @trimText()
  @multiLine()
  @IsNotEmpty({ message: 'Добавьте описание' })
  @MaxLength(2000, { message: 'Описание — не длиннее 2000 символов' })
  @IsString({ message: 'Добавьте описание' })
  description!: string;

  @ValidateIf((dto: CreateEventDto) => dto.newSport == null)
  @IsUUID('all', { message: 'Выберите направление из списка или добавьте новое' })
  sportId?: string;

  // Массив прошёл бы ValidateNested поэлементно и обошёл проверку sportId
  @IsOptional()
  @IsObject({ message: 'Новое направление — название и группа' })
  @ValidateNested()
  @Type(() => NewSportDto)
  newSport?: NewSportDto;

  @isoDate()
  @IsDate({ message: 'Укажите дату и время начала' })
  startsAt!: Date;

  @isoDate()
  @IsDate({ message: 'Укажите дату и время окончания' })
  endsAt!: Date;

  @cleanLine()
  @visible()
  @singleLine()
  @Length(2, 80, { message: 'Город — от 2 до 80 символов' })
  @IsString({ message: 'Укажите город' })
  city!: string;

  @cleanLine()
  @visible()
  @singleLine()
  @Length(2, 120, { message: 'Район или ориентир — от 2 до 120 символов' })
  @IsString({ message: 'Укажите район или ориентир' })
  area!: string;

  @cleanLine()
  @visible()
  @singleLine()
  @Length(3, 300, { message: 'Адрес или описание места — от 3 до 300 символов' })
  @IsString({ message: 'Укажите адрес или опишите место' })
  placeText!: string;

  @IsOptional()
  @trimText()
  @multiLine()
  @MaxLength(2000, { message: 'Информация для участников — не длиннее 2000 символов' })
  @IsString({ message: 'Информация для участников — текст' })
  participantInfo?: string;

  @IsIn(EVENT_MODES, { message: 'Выберите режим записи' })
  mode!: EventMode;

  @IsOptional()
  @trimText()
  @multiLine()
  @MaxLength(300, { message: 'Вопрос к заявке — не длиннее 300 символов' })
  @IsString({ message: 'Вопрос к заявке — текст' })
  applyQuestion?: string;

  @IsIn(EVENT_LEVELS, { message: 'Выберите уровень' })
  level!: EventLevel;
}

// Поле изменения: не передано — не меняется; передано — проверяется, null не пропускается
const present = () => ValidateIf((_dto: object, value: unknown) => value !== undefined);

// Дату, время и направление после публикации не меняют (ТЗ 2.2): поле в теле — понятный
// отказ при любом значении, и null тоже
const notEditable = (message: string) => (target: object, property: string) => {
  ValidateIf((_dto: object, value: unknown) => value !== undefined)(target, property);
  Equals(undefined, { message })(target, property);
};

/**
 * Изменение мероприятия после публикации (ТЗ 2.2, таблица): название, описание,
 * «Информация для участников», уровень и место — свободно; режим записи — пока нет
 * записей; лимит мест — не ниже числа подтверждённых. Дата и время — только переносом.
 * Правила, которые зависят от записей и времени, проверяет сервис.
 */
export class UpdateEventDto {
  @present()
  @cleanLine()
  @IsString({ message: 'Укажите название' })
  @Length(5, 80, { message: 'Название — от 5 до 80 символов' })
  @singleLine()
  @visible()
  title?: string;

  @present()
  @trimText()
  @IsString({ message: 'Добавьте описание' })
  @IsNotEmpty({ message: 'Добавьте описание' })
  @MaxLength(2000, { message: 'Описание — не длиннее 2000 символов' })
  @multiLine()
  description?: string;

  @present()
  @cleanLine()
  @IsString({ message: 'Укажите город' })
  @Length(2, 80, { message: 'Город — от 2 до 80 символов' })
  @singleLine()
  @visible()
  city?: string;

  @present()
  @cleanLine()
  @IsString({ message: 'Укажите район или ориентир' })
  @Length(2, 120, { message: 'Район или ориентир — от 2 до 120 символов' })
  @singleLine()
  @visible()
  area?: string;

  @present()
  @cleanLine()
  @IsString({ message: 'Укажите адрес или опишите место' })
  @Length(3, 300, { message: 'Адрес или описание места — от 3 до 300 символов' })
  @singleLine()
  @visible()
  placeText?: string;

  // Пустая строка — информацию убрали
  @present()
  @trimText()
  @IsString({ message: 'Информация для участников — текст' })
  @MaxLength(2000, { message: 'Информация для участников — не длиннее 2000 символов' })
  @multiLine()
  participantInfo?: string;

  @present()
  @IsIn(EVENT_MODES, { message: 'Выберите режим записи' })
  mode?: EventMode;

  // Пустая строка или null — вопроса нет
  @IsOptional()
  @trimText()
  @IsString({ message: 'Вопрос к заявке — текст' })
  @MaxLength(300, { message: 'Вопрос к заявке — не длиннее 300 символов' })
  @multiLine()
  applyQuestion?: string | null;

  @present()
  @IsIn(EVENT_LEVELS, { message: 'Выберите уровень' })
  level?: EventLevel;

  // null — без ограничения мест
  @IsOptional()
  @IsInt({ message: 'Лимит мест — целое число' })
  @Min(1, { message: 'Лимит мест — от 1 до 1000' })
  @Max(1000, { message: 'Лимит мест — от 1 до 1000' })
  capacity?: number | null;

  @notEditable('Дату и время меняют через «Перенести»')
  startsAt?: unknown;

  @notEditable('Дату и время меняют через «Перенести»')
  endsAt?: unknown;

  @notEditable('Направление после публикации не меняется')
  sportId?: unknown;

  @notEditable('Направление после публикации не меняется')
  newSport?: unknown;
}

export const FEED_DATES = ['today', 'tomorrow', 'weekend'] as const;
export type FeedDate = (typeof FEED_DATES)[number];

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Лента и поиск (ТЗ 2.8, 4.5). Все фильтры необязательны и складываются через «и». */
export class EventFeedQuery {
  @IsOptional()
  @cleanLine()
  @singleLine()
  @MaxLength(100, { message: 'Запрос — не длиннее 100 символов' })
  @IsString({ message: 'Запрос — строка' })
  q?: string;

  @IsOptional()
  @IsUUID('all', { message: 'Выберите направление из списка' })
  sport?: string;

  @IsOptional()
  @IsIn(SPORT_CATEGORIES, { message: 'Выберите группу из списка' })
  category?: SportCategory;

  /** Мероприятия одной организации — для её публичной страницы. */
  @IsOptional()
  @IsUUID('all', { message: 'Неверный номер организации' })
  organization?: string;

  @IsOptional()
  @IsIn(FEED_DATES, { message: 'Дата: сегодня, завтра или выходные' })
  date?: FeedDate;

  @IsOptional()
  @Matches(CALENDAR_DATE, { message: 'Дата «с» — в виде ГГГГ-ММ-ДД' })
  from?: string;

  @IsOptional()
  @Matches(CALENDAR_DATE, { message: 'Дата «по» — в виде ГГГГ-ММ-ДД' })
  to?: string;

  @IsOptional()
  @cleanLine()
  @singleLine()
  @MaxLength(80, { message: 'Город — не длиннее 80 символов' })
  @IsString({ message: 'Город — строка' })
  city?: string;

  @IsOptional()
  @cleanLine()
  @singleLine()
  @MaxLength(120, { message: 'Район — не длиннее 120 символов' })
  @IsString({ message: 'Район — строка' })
  area?: string;

  @IsOptional()
  @IsIn(EVENT_LEVELS, { message: 'Выберите уровень' })
  level?: EventLevel;

  @IsOptional()
  @IsIn(EVENT_MODES, { message: 'Выберите режим записи' })
  mode?: EventMode;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Лимит — целое число' })
  @Min(1, { message: 'Лимит — от 1 до 50' })
  @Max(50, { message: 'Лимит — от 1 до 50' })
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Смещение — целое число' })
  @Min(0, { message: 'Смещение — от 0 до 10000' })
  @Max(10_000, { message: 'Смещение — от 0 до 10000' })
  offset?: number;
}
