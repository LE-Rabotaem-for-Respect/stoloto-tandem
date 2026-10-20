import { DEMO_ACCOUNT_KEYS, normalizeEmail } from '@tandem/domain';
import type { DemoAccountKey } from '@tandem/domain';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { singleLine } from '../../core/validation';

const trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

const email = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  );

export const ACCOUNT_TYPES = ['person', 'organization'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** Регистрация: «Я — человек» или «Я — организация» (ТЗ 2.6). */
export class RegisterDto {
  @IsIn(ACCOUNT_TYPES, { message: 'Выберите: человек или организация' })
  accountType!: AccountType;

  @trim()
  @IsString({ message: 'Укажите имя' })
  @Length(2, 80, { message: 'Имя — от 2 до 80 символов' })
  @singleLine()
  name!: string;

  @email()
  @MaxLength(254, { message: 'Слишком длинная почта' })
  @IsEmail({}, { message: 'Укажите почту, например anna@mail.ru' })
  email!: string;

  @IsString({ message: 'Придумайте пароль' })
  @Length(8, 128, { message: 'Пароль — от 8 до 128 символов' })
  password!: string;

  @ValidateIf((dto: RegisterDto) => dto.accountType === 'organization')
  @trim()
  @IsString({ message: 'Укажите название организации' })
  @Length(2, 120, { message: 'Название организации — от 2 до 120 символов' })
  @singleLine()
  organizationName?: string;
}

// У демо-аккаунтов почта без домена верхнего уровня (`anna@demo`), поэтому формат почты при входе не проверяется.
// Длина проверяется первой в списке, чтобы для пустого поля первой шла ошибка «Укажите …»
export class LoginDto {
  @email()
  @MaxLength(254, { message: 'Слишком длинная почта' })
  @IsString({ message: 'Укажите почту' })
  @IsNotEmpty({ message: 'Укажите почту' })
  email!: string;

  @MaxLength(128, { message: 'Слишком длинный пароль' })
  @IsString({ message: 'Укажите пароль' })
  @IsNotEmpty({ message: 'Укажите пароль' })
  password!: string;
}

/** Быстрый вход: только ключ из списка демо-аккаунтов, не почта и не id (DECISION-003). */
export class DemoLoginDto {
  @IsIn(DEMO_ACCOUNT_KEYS, { message: 'Такого демо-аккаунта нет' })
  account!: DemoAccountKey;
}

/** Настройки оформления (ТЗ 2.8): у вошедшего хранятся в аккаунте, а не только в браузере. */
// Не передано — не меняется; null — не «нет», а ошибка
const present = () => ValidateIf((_dto: object, value: unknown) => value !== undefined);

export class UpdateSettingsDto {
  @present()
  @IsBoolean({ message: '«Крупный текст» — да или нет' })
  largeText?: boolean;

  @present()
  @IsBoolean({ message: '«Высокий контраст» — да или нет' })
  contrast?: boolean;
}
