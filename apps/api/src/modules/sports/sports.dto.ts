import { SPORT_CATEGORIES, SPORT_NAME_PATTERN, cleanSportName } from '@tandem/domain';
import type { SportCategory } from '@tandem/domain';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const SPORT_NAME_MAX_LENGTH = 50;

export const SPORT_NAME_RULE = `Название направления — от 2 до ${SPORT_NAME_MAX_LENGTH} символов: буквы, цифры, пробелы и знаки . , ' ( ) × / + -; над буквой — не больше одного значка`;

// Управляющие и невидимые символы (форматирующие, вроде U+200B и U+202E)
const NO_HIDDEN_CHARS = /^[^\p{Cc}\p{Cf}]*$/u;

export class SearchSportsQuery {
  @IsOptional()
  @IsString({ message: 'Запрос — строка' })
  @MaxLength(SPORT_NAME_MAX_LENGTH, { message: `Не длиннее ${SPORT_NAME_MAX_LENGTH} символов` })
  @Matches(NO_HIDDEN_CHARS, { message: 'В запросе есть недопустимые символы' })
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
  @Transform(({ value }) => (typeof value === 'string' ? cleanSportName(value) : value))
  @IsString({ message: 'Укажите название направления' })
  @Length(2, SPORT_NAME_MAX_LENGTH, { message: SPORT_NAME_RULE })
  @Matches(SPORT_NAME_PATTERN, { message: SPORT_NAME_RULE })
  name!: string;

  @IsOptional()
  @IsIn(SPORT_CATEGORIES, { message: 'Выберите группу из списка' })
  category?: SportCategory;
}
