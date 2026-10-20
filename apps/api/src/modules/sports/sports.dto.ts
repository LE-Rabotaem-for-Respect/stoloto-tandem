import {
  SINGLE_LINE_TEXT,
  SPORT_CATEGORIES,
  SPORT_NAME_MAX_LENGTH,
  SPORT_NAME_PATTERN,
  cleanSingleLine,
  cleanSportName,
} from '@tandem/domain';
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

export const SPORT_NAME_RULE = `Название направления — от 2 до ${SPORT_NAME_MAX_LENGTH} символов: буквы, цифры, пробелы и знаки . , ' ( ) × / + -; над буквой — не больше одного значка; в одном слове — буквы одного алфавита`;

export class SearchSportsQuery {
  @IsOptional()
  // Мягкий перенос внутри слова — прочь, как в названии мероприятия: иначе ничего не находится
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? cleanSingleLine(value) : value,
  )
  @Matches(SINGLE_LINE_TEXT, { message: 'В запросе есть недопустимые символы' })
  @MaxLength(SPORT_NAME_MAX_LENGTH, { message: `Не длиннее ${SPORT_NAME_MAX_LENGTH} символов` })
  @IsString({ message: 'Запрос — строка' })
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
