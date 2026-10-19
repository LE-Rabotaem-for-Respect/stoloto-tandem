import { Injectable } from '@nestjs/common';
import { DEFAULT_SPORT_CATEGORY, normalizeSportName } from '@tandem/domain';
import type { SportCategory } from '@tandem/domain';
import { ApiError } from '../../core/errors';
import { Prisma } from '../../generated/prisma/client';
import type { Sport } from '../../generated/prisma/client';
import { SportsRepository } from './sports.repository';

export interface SportItem {
  id: string;
  name: string;
  category: SportCategory;
  isCustom: boolean;
}

export interface SportSearchResult {
  items: SportItem[];
  /** Запрос совпал с направлением каталога: пункт «Добавить как новое» не нужен. */
  exactMatch: boolean;
}

export interface NewSport {
  name: string;
  category?: SportCategory;
}

const DEFAULT_LIMIT = 10;

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

@Injectable()
export class SportsService {
  constructor(private readonly sports: SportsRepository) {}

  /** Подсказки для автодополнения и фильтра по направлению (ТЗ 2.3). Скрытые не показываются. */
  async search(query = '', limit = DEFAULT_LIMIT): Promise<SportSearchResult> {
    const normalized = normalizeSportName(query);
    const rows = await this.sports.search(normalized, limit);
    return {
      items: rows.map(({ id, name, category, isCustom }) => ({ id, name, category, isCustom })),
      exactMatch: normalized !== '' && rows.some((row) => row.exact),
    };
  }

  /**
   * Направление по названию из формы: уже известное (по нормализованному имени
   * или алиасу) либо новое пользовательское, сразу доступное в поиске.
   * Поэтому «Падел» и «падел » не создают дубль.
   */
  async findOrCreate(input: NewSport, createdById: string): Promise<Sport> {
    const name = input.name.trim().replace(/\s+/g, ' ');
    const normalizedName = normalizeSportName(name);
    if (normalizedName.length < 2) {
      throw new ApiError('validation_failed', { name: 'Название направления — от 2 символов' });
    }

    const existing = await this.sports.findByName(normalizedName);
    if (existing) return existing;

    const record = {
      name,
      normalizedName,
      category: input.category ?? DEFAULT_SPORT_CATEGORY,
      createdById,
    };
    try {
      return await this.sports.createCustom(record);
    } catch (error) {
      // То же название мог одновременно добавить другой пользователь — берём его запись
      if (isUniqueViolation(error)) {
        const created = await this.sports.findByName(normalizedName);
        if (created) return created;
      }
      throw error;
    }
  }
}
