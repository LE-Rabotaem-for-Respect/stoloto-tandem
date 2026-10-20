import type { Action } from '@tandem/domain';
import { describe, expect, it } from 'vitest';
import type { EventCardView } from '../src/features/event-card/api';
import { cardStatus } from '../src/features/event-card/status';

const event = (patch: Partial<EventCardView> = {}): EventCardView => ({
  id: 'e1',
  title: 'Пробежка',
  description: '',
  sport: { id: 's', name: 'Бег', category: 'endurance', isCustom: false },
  organizer: { kind: 'user', id: 'u', name: 'Игорь' },
  startsAt: '2026-10-21T00:30:00Z',
  endsAt: '2026-10-21T01:30:00Z',
  previousStartsAt: null,
  city: 'Красноярск',
  area: 'Татышев',
  placeText: 'Вход у моста',
  mode: 'free',
  applyQuestion: null,
  level: 'amateur',
  status: 'published',
  statusReason: null,
  displayStatus: 'open',
  participation: null,
  participationReason: null,
  participantInfo: null,
  capacity: null,
  confirmedCount: 0,
  actions: [],
  ...patch,
});
const join: Action = { code: 'join', enabled: true };

describe('статус в панели действия и строка полного статуса', () => {
  it('набор открыт, записи нет — строки нет, ей нечего добавить', () => {
    expect(cardStatus(event(), join)).toMatchObject({
      panel: { text: 'Набор открыт', tone: 'ok' },
      full: null,
    });
  });

  it('длинные статусы в панели — короткой формой, полный — строкой', () => {
    expect(cardStatus(event({ displayStatus: 'full' }), join)).toMatchObject({
      panel: { text: 'Мест нет, есть лист ожидания' },
      full: 'Мест нет — можно встать в лист ожидания',
    });
    const waitlist = cardStatus(event({ participation: 'waitlist' }), undefined);
    expect(waitlist.panel.text).toBe('Лист ожидания');
    expect(waitlist.full).toBe('Набор открыт. Вы в листе ожидания');
  });

  it('у завершённого и отменённого — статус мероприятия, запись вторым предложением', () => {
    expect(
      cardStatus(
        event({
          displayStatus: 'cancelled',
          statusReason: 'Гроза',
          participation: 'confirmed',
        }),
        { code: 'leave', enabled: false, reason: 'Мероприятие отменено' },
      ),
    ).toMatchObject({
      panel: { text: 'Отменено организатором', tone: 'bad' },
      full: 'Отменено организатором. Причина: Гроза. Вы участник',
    });
    // Своя отменённая запись не добавляется
    expect(
      cardStatus(event({ displayStatus: 'finished', participation: 'cancelled' }), undefined).full,
    ).toBeNull();
  });

  it('отклонённая заявка — в панели «Заявка отклонена», причина решения — в строке', () => {
    expect(
      cardStatus(event({ participation: 'rejected', participationReason: 'Нет мест' }), undefined),
    ).toMatchObject({
      panel: { text: 'Заявка отклонена', tone: 'bad' },
      full: 'Заявка отклонена. Причина: Нет мест',
    });
  });

  it('кнопка недоступна, а статус говорит «можно» — короткая причина в панели, полная — в строке', () => {
    const own: Action = {
      code: 'join',
      enabled: false,
      reason: 'Нельзя записаться на своё мероприятие',
      reasonCode: 'own_event',
    };
    expect(cardStatus(event(), own)).toMatchObject({
      panel: { text: 'Это ваше мероприятие', tone: 'off', icon: 'action-reject' },
      full: 'Набор открыт. Нельзя записаться на своё мероприятие',
    });
  });

  it('гостю — обычный статус: кнопка у него активна и ведёт на вход', () => {
    const guest: Action = { code: 'join', enabled: false, requiresAuth: true, reason: 'Войдите' };
    expect(cardStatus(event(), guest)).toMatchObject({
      panel: { text: 'Набор открыт' },
      full: null,
    });
  });
});
