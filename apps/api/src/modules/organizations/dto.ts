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
import { cleanLine, multiLine, singleLine, trimText, visible } from '../../core/validation';

/**
 * Профиль организации (ТЗ 2.9). Все поля необязательны: правка частичная,
 * а полноту профиля проверяет отправка на проверку.
 */
export class UpdateOrganizationDto {
  @IsOptional()
  @cleanLine()
  @visible({ allowEmpty: true })
  @singleLine()
  @Length(2, 120, { message: 'Название — от 2 до 120 символов' })
  @IsString({ message: 'Укажите название' })
  name?: string;

  @IsOptional()
  @trimText()
  @multiLine()
  @MaxLength(2000, { message: 'Описание — не длиннее 2000 символов' })
  @IsString({ message: 'Расскажите, чем занимается организация' })
  description?: string;

  @IsOptional()
  @cleanLine()
  @visible({ allowEmpty: true })
  @singleLine()
  @MaxLength(80, { message: 'Город — не длиннее 80 символов' })
  @IsString({ message: 'Укажите город' })
  city?: string;

  // Телефон, мессенджер и часы работы — можно с новой строки
  @IsOptional()
  @trimText()
  @multiLine()
  @MaxLength(300, { message: 'Контакты — не длиннее 300 символов' })
  @IsString({ message: 'Укажите контакты' })
  contacts?: string;

  /** Пустая строка — сайта нет. */
  @IsOptional()
  @cleanLine()
  @singleLine()
  @ValidateIf((dto: UpdateOrganizationDto) => dto.website !== '')
  @IsUrl(
    { require_protocol: true, protocols: ['http', 'https'] },
    { message: 'Ссылка на сайт или соцсеть, например https://vk.com/club' },
  )
  @MaxLength(300, { message: 'Ссылка — не длиннее 300 символов' })
  website?: string;

  @IsOptional()
  @cleanLine()
  @singleLine()
  @MaxLength(120, { message: 'Имя представителя — не длиннее 120 символов' })
  @IsString({ message: 'Укажите, кто представитель' })
  representativeName?: string;

  @IsOptional()
  @cleanLine()
  @singleLine()
  @MaxLength(120, { message: 'Роль — не длиннее 120 символов' })
  @IsString({ message: 'Укажите роль представителя' })
  representativeRole?: string;

  @IsOptional()
  @IsArray({ message: 'Выберите направления' })
  @ArrayMaxSize(20, { message: 'Не больше 20 направлений' })
  @IsUUID('all', { each: true, message: 'Неверное направление' })
  sportIds?: string[];
}
