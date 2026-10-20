import { Injectable } from '@nestjs/common';
import {
  DEFAULT_SPORT_CATEGORY,
  cleanSportName,
  isValidSportName,
  normalizeSportName,
} from '@tandem/domain';
import type { SportCategory } from '@tandem/domain';
import { ApiError } from '../../core/errors';
import type { Sport, SportStatus } from '../../generated/prisma/client';
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

/** Направление в каталоге администратора: со статусом и прежними именами. */
export interface AdminSport extends SportItem {
  status: SportStatus;
  aliases: string[];
}

const DEFAULT_LIMIT = 10;
const NOT_FOUND = 'Направление не найдено';
const ALREADY_HIDDEN = 'Направление уже объединено или скрыто — обновите список';

const toItem = ({ id, name, category, isCustom }: SportItem): SportItem => ({
  id,
  name,
  category,
  isCustom,
});

const toAdminSport = (sport: Sport): AdminSport => ({
  ...toItem(sport),
  status: sport.status,
  aliases: sport.aliases,
});

// Имя из формы: те же правила, что у нового направления в форме мероприятия
function validName(input: string, field: string): { name: string; normalizedName: string } {
  const name = cleanSportName(input);
  if (name.length < 2 || !isValidSportName(name)) {
    throw new ApiError('validation_failed', { [field]: SPORT_NAME_RULE });
  }
  return { name, normalizedName: normalizeSportName(name) };
}

const unique = (names: readonly string[], except: string) =>
  [...new Set(names)].filter((name) => name !== except);

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

  /** Все ли направления из списка есть в каталоге и не скрыты. */
  async allActive(ids: readonly string[]): Promise<boolean> {
    const unique = new Set(ids);
    return (await this.sports.countActive([...unique])) === unique.size;
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
    const { name, normalizedName } = validName(input.name, 'name');

    const sport =
      (await this.sports.findByName(normalizedName, tx)) ??
      (await this.sports.createCustom(
        { name, normalizedName, category: input.category ?? DEFAULT_SPORT_CATEGORY, createdById },
        tx,
      ));
    return toItem(sport);
  }

  /**
   * Каталог для администратора (ТЗ 2.3): все направления, в том числе скрытые; поиск —
   * по имени и прежним именам. Права проверяет вызывающий — админка.
   */
  async adminList(
    filter: { text?: string; status?: SportStatus; custom?: boolean },
    page: { limit: number; offset: number },
  ): Promise<{ items: AdminSport[]; total: number }> {
    const normalizedText = filter.text ? normalizeSportName(filter.text) : undefined;
    const { sports, total } = await this.sports.adminSearch(
      { normalizedText: normalizedText || undefined, status: filter.status, custom: filter.custom },
      page,
    );
    return { items: sports.map(toAdminSport), total };
  }

  /**
   * Переименовать. Прежнее имя уходит в алиасы: по нему направление по-прежнему находится.
   * Имя другого направления занять нельзя — такие дубли объединяют.
   */
  async rename(id: string, input: string): Promise<AdminSport> {
    const { name, normalizedName } = validName(input, 'name');
    return this.locked(id, async (sport, tx) => {
      const owner = await this.sports.findByName(normalizedName, tx);
      if (owner && owner.id !== id) {
        throw new ApiError('validation_failed', {
          name: `Такое направление уже есть: «${owner.name}». Объедините с ним`,
        });
      }
      const changed = await this.sports.update(
        id,
        {
          name,
          normalizedName,
          aliases: unique([...sport.aliases, sport.normalizedName], normalizedName),
        },
        tx,
      );
      return toAdminSport(changed);
    });
  }

  /** Пользовательское — в основной список, в выбранную группу (ТЗ 2.3). */
  async promote(id: string, category: SportCategory): Promise<AdminSport> {
    return this.locked(id, async (_sport, tx) =>
      toAdminSport(await this.sports.update(id, { isCustom: false, category }, tx)),
    );
  }

  /**
   * Скрыть некорректное название: его нет в подсказках и фильтрах, мероприятия с ним
   * остаются и показываются в группе «Другое» (ТЗ 2.3).
   */
  async hide(id: string): Promise<AdminSport> {
    return this.locked(id, async (_sport, tx) =>
      toAdminSport(await this.sports.update(id, { status: 'hidden' }, tx)),
    );
  }

  /**
   * Объединить дубль с целевым направлением (DECISION-003) в одной транзакции:
   * `moveOwners` переносит мероприятия и направления организаций через их модули,
   * затем — данные пользователя; имена дубля становятся алиасами целевого, сам дубль
   * скрывается. Оба направления заблокированы до конца: встречное объединение ждёт.
   */
  async merge(
    sourceId: string,
    targetId: string,
    moveOwners: (tx: Db) => Promise<void>,
  ): Promise<AdminSport> {
    if (sourceId === targetId) {
      throw new ApiError('validation_failed', { targetId: 'Выберите другое направление' });
    }
    return this.sports.transaction(async (tx) => {
      const locked = await this.sports.lock([sourceId, targetId], tx);
      const source = locked.find((sport) => sport.id === sourceId);
      const target = locked.find((sport) => sport.id === targetId);
      if (!source) throw new ApiError('not_found', undefined, NOT_FOUND);
      if (!target) throw new ApiError('validation_failed', { targetId: NOT_FOUND });
      // Источник мог объединить или скрыть запрос, который держал блокировку раньше:
      // его имена уже стали алиасами другого направления
      if (source.status !== 'active') {
        throw new ApiError('conflict', undefined, ALREADY_HIDDEN);
      }
      if (target.status !== 'active') {
        throw new ApiError('validation_failed', {
          targetId: 'Скрытое направление не может принять дубль',
        });
      }

      await moveOwners(tx);
      await this.sports.moveUserReferences(sourceId, targetId, tx);
      await this.sports.update(sourceId, { status: 'hidden', aliases: [] }, tx);
      const merged = await this.sports.update(
        targetId,
        {
          aliases: unique(
            [...target.aliases, source.normalizedName, ...source.aliases],
            target.normalizedName,
          ),
        },
        tx,
      );
      return toAdminSport(merged);
    });
  }

  /**
   * Изменение одного направления под блокировкой строки: строка читается заново, поэтому
   * одновременное объединение или переименование не теряет записанные им алиасы.
   */
  private locked<T>(id: string, work: (sport: Sport, tx: Db) => Promise<T>): Promise<T> {
    return this.sports.transaction(async (tx) => {
      const [sport] = await this.sports.lock([id], tx);
      if (!sport) throw new ApiError('not_found', undefined, NOT_FOUND);
      return work(sport, tx);
    });
  }
}
