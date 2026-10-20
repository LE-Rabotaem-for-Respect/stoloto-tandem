import {
  EVENT_STATUSES,
  ORGANIZATION_STATUSES,
  SINGLE_LINE_TEXT,
  SPORT_CATEGORIES,
} from '@tandem/domain';
import type { EventStatus, OrganizationStatus, SportCategory } from '@tandem/domain';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

const HIDDEN_CHARS = 'В тексте есть недопустимые символы';

/** Страница списка админки: по 20, не дальше 10 000-й строки. */
class AdminPageQuery {
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

  @IsOptional()
  @trim()
  @IsString({ message: 'Запрос — строка' })
  @MaxLength(100, { message: 'Запрос — не длиннее 100 символов' })
  @Matches(SINGLE_LINE_TEXT, { message: HIDDEN_CHARS })
  q?: string;
}

export class AdminOrganizationsQuery extends AdminPageQuery {
  @IsOptional()
  @IsIn(ORGANIZATION_STATUSES, { message: 'Выберите статус из списка' })
  status?: OrganizationStatus;

  /** Одна организация — переход от организатора мероприятия. */
  @IsOptional()
  @IsUUID('all', { message: 'Неверная организация' })
  id?: string;
}

export class AdminEventsQuery extends AdminPageQuery {
  @IsOptional()
  @IsIn(EVENT_STATUSES, { message: 'Выберите статус из списка' })
  status?: EventStatus;

  @IsOptional()
  @IsUUID('all', { message: 'Неверная организация' })
  organizationId?: string;

  /** `week` — статус сменился за последние 7 дней (плитка «События сняты за неделю»). */
  @IsOptional()
  @IsIn(['week'], { message: 'Период: week' })
  period?: 'week';
}

export class AdminMessagesQuery {
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

export const ORGANIZATION_DECISIONS = ['approve', 'reject'] as const;
export type AdminOrganizationDecision = (typeof ORGANIZATION_DECISIONS)[number];

/** «Одобрить» или «Отклонить» с причиной (ТЗ 2.10): причину увидит организация. */
export class OrganizationDecisionDto {
  @IsIn(ORGANIZATION_DECISIONS, { message: 'Решение: одобрить или отклонить' })
  decision!: AdminOrganizationDecision;

  @ValidateIf(
    (dto: OrganizationDecisionDto) => dto.decision === 'reject' || dto.reason !== undefined,
  )
  @trim()
  @IsString({ message: 'Укажите причину отказа' })
  @MaxLength(500, { message: 'Причина — не длиннее 500 символов' })
  @Matches(/\S/, { message: 'Укажите причину отказа' })
  @Matches(SINGLE_LINE_TEXT, { message: HIDDEN_CHARS })
  reason?: string;
}

export const SPORT_STATUSES = ['active', 'hidden'] as const;

export class AdminSportsQuery extends AdminPageQuery {
  @IsOptional()
  @IsIn(SPORT_STATUSES, { message: 'Статус: active или hidden' })
  status?: (typeof SPORT_STATUSES)[number];

  /** `true` — только пользовательские направления, `false` — только основной список. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'custom: true или false' })
  custom?: boolean;
}

/** Новое имя направления; правила — как у нового направления в форме мероприятия. */
export class RenameSportDto {
  @IsString({ message: 'Укажите название направления' })
  name!: string;
}

export class MergeSportDto {
  @IsUUID('all', { message: 'Выберите направление из списка' })
  targetId!: string;
}

export class PromoteSportDto {
  @IsIn(SPORT_CATEGORIES, { message: 'Выберите группу из списка' })
  category!: SportCategory;
}
