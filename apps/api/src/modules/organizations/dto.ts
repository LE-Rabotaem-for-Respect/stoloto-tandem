import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

/**
 * Профиль организации (ТЗ 2.9). Все поля необязательны: правка частичная,
 * а полноту профиля проверяет отправка на проверку.
 */
export class UpdateOrganizationDto {
  @IsOptional()
  @trim()
  @IsString({ message: 'Укажите название' })
  @Length(2, 120, { message: 'Название — от 2 до 120 символов' })
  name?: string;

  @IsOptional()
  @trim()
  @IsString({ message: 'Расскажите, чем занимается организация' })
  @MaxLength(2000, { message: 'Описание — не длиннее 2000 символов' })
  description?: string;

  @IsOptional()
  @trim()
  @IsString({ message: 'Укажите город' })
  @MaxLength(80, { message: 'Город — не длиннее 80 символов' })
  city?: string;

  @IsOptional()
  @trim()
  @IsString({ message: 'Укажите контакты' })
  @MaxLength(300, { message: 'Контакты — не длиннее 300 символов' })
  contacts?: string;

  /** Пустая строка — сайта нет. */
  @IsOptional()
  @trim()
  @ValidateIf((dto: UpdateOrganizationDto) => dto.website !== '')
  @IsUrl(
    { require_protocol: true, protocols: ['http', 'https'] },
    { message: 'Ссылка на сайт или соцсеть, например https://vk.com/club' },
  )
  @MaxLength(300, { message: 'Ссылка — не длиннее 300 символов' })
  website?: string;

  @IsOptional()
  @trim()
  @IsString({ message: 'Укажите, кто представитель' })
  @MaxLength(120, { message: 'Имя представителя — не длиннее 120 символов' })
  representativeName?: string;

  @IsOptional()
  @trim()
  @IsString({ message: 'Укажите роль представителя' })
  @MaxLength(120, { message: 'Роль — не длиннее 120 символов' })
  representativeRole?: string;

  @IsOptional()
  @IsArray({ message: 'Выберите направления' })
  @ArrayMaxSize(20, { message: 'Не больше 20 направлений' })
  @IsUUID('all', { each: true, message: 'Неверное направление' })
  sportIds?: string[];
}
