import { SPORT_CATEGORIES } from '@tandem/domain';
import type { SportCategory } from '@tandem/domain';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';

export const SPORT_NAME_MAX_LENGTH = 50;

export class SearchSportsQuery {
  @IsOptional()
  @IsString({ message: 'Запрос — строка' })
  @MaxLength(SPORT_NAME_MAX_LENGTH, { message: `Не длиннее ${SPORT_NAME_MAX_LENGTH} символов` })
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Лимит — целое число' })
  @Min(1, { message: 'Лимит — от 1 до 100' })
  @Max(100, { message: 'Лимит — от 1 до 100' })
  limit?: number;
}

/**
 * Направление, которого нет в каталоге, из формы создания мероприятия
 * («Добавить «…» как новое направление»).
 */
export class NewSportDto {
  @IsString({ message: 'Укажите название направления' })
  @Length(2, SPORT_NAME_MAX_LENGTH, {
    message: `Название направления — от 2 до ${SPORT_NAME_MAX_LENGTH} символов`,
  })
  name!: string;

  @IsOptional()
  @IsIn(SPORT_CATEGORIES, { message: 'Выберите группу из списка' })
  category?: SportCategory;
}
