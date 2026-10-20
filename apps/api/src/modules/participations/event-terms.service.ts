import { Injectable } from '@nestjs/common';
import type { EventMode } from '@tandem/domain';
import { isUUID } from 'class-validator';
import type { ErrorFields } from '../../core/errors';
import { ParticipationsRepository } from './participations.repository';
import type { Db, JoinableEvent } from './participations.repository';

/**
 * Смена режима записи и лимита мест мероприятия (ТЗ 2.2; DECISION-002, «Лимит мест»):
 * строка мероприятия блокируется, как при записи, записи и места считает модуль участия.
 * Отдельный сервис без зависимости от мероприятий: изменение мероприятия вызывает его,
 * а модулю участия мероприятия нужны для «Моих записей» — так модули не зависят по кругу.
 */
@Injectable()
export class EventTermsService {
  constructor(private readonly participations: ParticipationsRepository) {}

  /**
   * Вызывается в транзакции изменения мероприятия до его проверок; возвращает
   * заблокированное мероприятие и отказы по полям, `null` — мероприятия нет.
   * Продвижение листа ожидания при увеличении лимита — 3.2 (P1), появится здесь же.
   */
  async lockForTermsChange(
    eventId: string,
    change: { mode?: EventMode; capacity?: number | null },
    tx: Db,
  ): Promise<{ event: JoinableEvent; fields: ErrorFields } | null> {
    const event = isUUID(eventId) ? await this.participations.lockEvent(eventId, tx) : null;
    if (!event) return null;
    const fields: ErrorFields = {};
    if (change.mode !== undefined && change.mode !== event.mode) {
      if ((await this.participations.activeCount(eventId, tx)) > 0) {
        fields.mode = 'Режим записи не меняется, пока есть заявки, участники или лист ожидания';
      }
    }
    if (typeof change.capacity === 'number') {
      const confirmed = await this.participations.confirmedCount(eventId, tx);
      if (change.capacity < confirmed) {
        fields.capacity = `Лимит мест — не ниже числа подтверждённых участников: ${confirmed}`;
      }
    }
    return { event, fields };
  }
}
