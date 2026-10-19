import { Injectable } from '@nestjs/common';
import {
  DEFAULT_SPORT_CATEGORY,
  cleanSportName,
  isValidSportName,
  normalizeSportName,
} from '@tandem/domain';
import type { SportCategory } from '@tandem/domain';
import { ApiError } from '../../core/errors';
import { SPORT_NAME_RULE } from './sports.dto';
import { SportsRepository } from './sports.repository';
import type { Db } from './sports.repository';

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

const toItem = ({ id, name, category, isCustom }: SportItem): SportItem => ({
  id,
  name,
  category,
  isCustom,
});

@Injectable()
export class SportsService {
  constructor(private readonly sports: SportsRepository) {}

  /** Направление, выбранное из подсказок; скрытое выбрать нельзя. */
  async findActive(id: string, tx?: Db): Promise<SportItem | null> {
    const sport = await this.sports.findActiveById(id, tx);
    return sport && toItem(sport);
  }

  /** Подсказки для автодополнения и фильтра по направлению (ТЗ 2.3). Скрытые не показываются. */
  async search(query = '', limit = DEFAULT_LIMIT): Promise<SportSearchResult> {
    const normalized = normalizeSportName(query);
    const rows = await this.sports.search(normalized, limit);
    return {
      items: rows.map(toItem),
      exactMatch: normalized !== '' && rows.some((row) => row.exact),
    };
  }

  /**
   * Направление по названию из формы: уже известное (по нормализованному имени
   * или алиасу) либо новое пользовательское, сразу доступное в поиске.
   * Поэтому «Падел» и «падел » не создают дубль. Скрытое направление с тем же
   * именем используется повторно: такое мероприятие показывается в группе «Другое» (ТЗ 2.3).
   *
   * Вызывать после всех проверок создания мероприятия и в его транзакции (`tx`):
   * если мероприятие не сохранится, новое направление не останется в каталоге.
   */
  async findOrCreate(input: NewSport, createdById: string, tx?: Db): Promise<SportItem> {
    const name = cleanSportName(input.name);
    if (name.length < 2 || !isValidSportName(name)) {
      throw new ApiError('validation_failed', { name: SPORT_NAME_RULE });
    }
    const normalizedName = normalizeSportName(name);

    const sport =
      (await this.sports.findByName(normalizedName, tx)) ??
      (await this.sports.createCustom(
        { name, normalizedName, category: input.category ?? DEFAULT_SPORT_CATEGORY, createdById },
        tx,
      ));
    return toItem(sport);
  }
}
