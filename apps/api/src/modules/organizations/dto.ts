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
import { multiLine, singleLine, trimLine, trimText } from '../../core/validation';

/**
 * Профиль организации (ТЗ 2.9). Все поля необязательны: правка частичная,
 * а полноту профиля проверяет отправка на проверку.
 */
export class UpdateOrganizationDto {
  @IsOptional()
  @trimLine()
  @IsString({ message: 'Укажите название' })
  @Length(2, 120, { message: 'Название — от 2 до 120 символов' })
  @singleLine()
  name?: string;

  @IsOptional()
  @trimText()
  @IsString({ message: 'Расскажите, чем занимается организация' })
  @MaxLength(2000, { message: 'Описание — не длиннее 2000 символов' })
  @multiLine()
  description?: string;

  @IsOptional()
  @trimLine()
  @IsString({ message: 'Укажите город' })
  @MaxLength(80, { message: 'Город — не длиннее 80 символов' })
  @singleLine()
  city?: string;

  // Телефон, мессенджер и часы работы — можно с новой строки
  @IsOptional()
  @trimText()
  @IsString({ message: 'Укажите контакты' })
  @MaxLength(300, { message: 'Контакты — не длиннее 300 символов' })
  @multiLine()
  contacts?: string;

  /** Пустая строка — сайта нет. */
  @IsOptional()
  @trimLine()
  @ValidateIf((dto: UpdateOrganizationDto) => dto.website !== '')
  @IsUrl(
    { require_protocol: true, protocols: ['http', 'https'] },
    { message: 'Ссылка на сайт или соцсеть, например https://vk.com/club' },
  )
  @MaxLength(300, { message: 'Ссылка — не длиннее 300 символов' })
  website?: string;

  @IsOptional()
  @trimLine()
  @IsString({ message: 'Укажите, кто представитель' })
  @MaxLength(120, { message: 'Имя представителя — не длиннее 120 символов' })
  @singleLine()
  representativeName?: string;

  @IsOptional()
  @trimLine()
  @IsString({ message: 'Укажите роль представителя' })
  @MaxLength(120, { message: 'Роль — не длиннее 120 символов' })
  @singleLine()
  representativeRole?: string;

  @IsOptional()
  @IsArray({ message: 'Выберите направления' })
  @ArrayMaxSize(20, { message: 'Не больше 20 направлений' })
  @IsUUID('all', { each: true, message: 'Неверное направление' })
  sportIds?: string[];
}
