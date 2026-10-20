import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_ICON,
  NOTIFICATION_TYPES,
  isNotificationType,
  notificationText,
} from '../src';

describe('уведомления', () => {
  it('у каждого типа есть одна строка текста и пиктограмма', () => {
    for (const type of NOTIFICATION_TYPES) {
      const text = notificationText(type, { eventTitle: 'Футбол', organizationName: 'Ладья' });
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toContain('\n');
      expect(NOTIFICATION_ICON[type]).toMatch(/^(status|action|mode)-/);
    }
  });

  it('текст называет мероприятие и причину', () => {
    expect(notificationText('participation_requested', { eventTitle: 'Футбол' })).toBe(
      'Новая заявка на «Футбол»',
    );
    expect(
      notificationText('event_cancelled', { eventTitle: 'Футбол', reason: 'Поле закрыто' }),
    ).toBe('«Футбол» отменено организатором. Причина: Поле закрыто');
    expect(notificationText('participation_rejected', { eventTitle: 'Футбол' })).toBe(
      'Заявка на «Футбол» отклонена',
    );
  });

  it('перенос — новое время по Красноярску', () => {
    expect(
      notificationText('event_rescheduled', {
        eventTitle: 'Футбол',
        startsAt: '2026-11-14T12:00:00Z',
      }),
    ).toBe('«Футбол» перенесено на 14 ноября в 19:00');
  });

  it('решение по организации — по исходу', () => {
    const payload = { organizationName: 'Ладья' };
    expect(notificationText('organization_decided', { ...payload, decision: 'approved' })).toBe(
      'Организация «Ладья» допущена: публикуйте события',
    );
    expect(
      notificationText('organization_decided', {
        ...payload,
        decision: 'rejected',
        reason: 'Нет контактов',
      }),
    ).toBe('Заявка организации «Ладья» отклонена. Причина: Нет контактов');
  });

  it('распознаёт только типы из списка', () => {
    expect(isNotificationType('question_posted')).toBe(true);
    expect(isNotificationType('ParticipationRequested')).toBe(false);
  });
});
