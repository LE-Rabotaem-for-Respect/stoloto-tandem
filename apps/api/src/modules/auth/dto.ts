import { DEMO_ACCOUNT_KEYS, normalizeEmail } from '@tandem/domain';
import type { DemoAccountKey } from '@tandem/domain';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';

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
  name!: string;

  @email()
  @IsEmail({}, { message: 'Укажите почту, например anna@mail.ru' })
  @MaxLength(254, { message: 'Слишком длинная почта' })
  email!: string;

  @IsString({ message: 'Придумайте пароль' })
  @Length(8, 128, { message: 'Пароль — от 8 до 128 символов' })
  password!: string;

  @ValidateIf((dto: RegisterDto) => dto.accountType === 'organization')
  @trim()
  @IsString({ message: 'Укажите название организации' })
  @Length(2, 120, { message: 'Название организации — от 2 до 120 символов' })
  organizationName?: string;
}

// У демо-аккаунтов почта без домена верхнего уровня (`anna@demo`), поэтому формат почты при входе не проверяется
export class LoginDto {
  @email()
  @IsString({ message: 'Укажите почту' })
  @IsNotEmpty({ message: 'Укажите почту' })
  @MaxLength(254, { message: 'Слишком длинная почта' })
  email!: string;

  @IsString({ message: 'Укажите пароль' })
  @IsNotEmpty({ message: 'Укажите пароль' })
  @MaxLength(128, { message: 'Слишком длинный пароль' })
  password!: string;
}

/** Быстрый вход: только ключ из списка демо-аккаунтов, не почта и не id (DECISION-003). */
export class DemoLoginDto {
  @IsIn(DEMO_ACCOUNT_KEYS, { message: 'Такого демо-аккаунта нет' })
  account!: DemoAccountKey;
}
