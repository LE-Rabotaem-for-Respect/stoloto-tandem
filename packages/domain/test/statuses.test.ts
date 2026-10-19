import { describe, expect, it } from 'vitest';
import {
  EVENT_DISPLAY_STATUSES,
  EVENT_STATUS_VIEW,
  MESSAGE_STATUSES,
  MESSAGE_STATUS_VIEW,
  ORGANIZATION_STATUSES,
  ORGANIZATION_STATUS_VIEW,
  PARTICIPATION_STATUSES,
  PARTICIPATION_STATUS_VIEW,
  STATUS_TONES,
  participationStatusText,
  toneTokens,
} from '../src';
import type { StatusView } from '../src';

const views: [string, readonly string[], Record<string, StatusView>][] = [
  ['записи', PARTICIPATION_STATUSES, PARTICIPATION_STATUS_VIEW],
  ['мероприятия', EVENT_DISPLAY_STATUSES, EVENT_STATUS_VIEW],
  ['организации', ORGANIZATION_STATUSES, ORGANIZATION_STATUS_VIEW],
  ['сообщения', MESSAGE_STATUSES, MESSAGE_STATUS_VIEW],
];

describe('statuses: у каждого статуса текст, иконка и тон (П4)', () => {
  for (const [name, statuses, view] of views) {
    it(`статусы ${name} описаны все и без лишних`, () => {
      expect(Object.keys(view).sort()).toEqual([...statuses].sort());
    });

    it(`статусы ${name}: текст, пиктограмма из набора и тон из палитры`, () => {
      for (const [status, { text, icon, tone }] of Object.entries(view)) {
        expect(text.trim(), status).not.toBe('');
        expect(icon, status).toMatch(/^(status|action|mode)-[a-z-]+$/);
        expect(STATUS_TONES, status).toContain(tone);
      }
    });
  }
});

describe('тексты статусов по ТЗ', () => {
  it('записи (2.5)', () => {
    expect(PARTICIPATION_STATUS_VIEW).toMatchObject({
      pending: { text: 'Заявка на рассмотрении', icon: 'status-pending', tone: 'wait' },
      confirmed: { text: 'Вы участник', icon: 'status-confirmed', tone: 'ok' },
      rejected: { text: 'Заявка отклонена', icon: 'status-rejected', tone: 'bad' },
      waitlist: { text: 'Вы в листе ожидания', icon: 'status-waitlist', tone: 'queue' },
      cancelled: { text: 'Вы отменили запись', icon: 'status-cancelled', tone: 'off' },
    });
  });

  it('мероприятия (4.3)', () => {
    expect(EVENT_STATUS_VIEW).toMatchObject({
      open: { text: 'Набор открыт', icon: 'action-join', tone: 'ok' },
      full: {
        text: 'Мест нет — можно встать в лист ожидания',
        icon: 'status-full',
        tone: 'queue',
      },
      rescheduled: { text: 'Перенесено', icon: 'status-rescheduled', tone: 'warn' },
      ongoing: { text: 'Идёт', icon: 'status-ongoing', tone: 'ok' },
      finished: { text: 'Завершено', icon: 'status-finished', tone: 'off' },
      cancelled: {
        text: 'Отменено организатором',
        icon: 'status-event-cancelled',
        tone: 'bad',
      },
      unpublished: { text: 'Снято с публикации модератором', icon: 'action-hide', tone: 'off' },
      deleted: { text: 'Удалено модератором', icon: 'action-delete', tone: 'off' },
    });
  });

  it('организации (2.9): заявка «На рассмотрении»', () => {
    expect(ORGANIZATION_STATUS_VIEW.pending).toEqual({
      text: 'На рассмотрении',
      icon: 'status-pending',
      tone: 'wait',
    });
    expect(ORGANIZATION_STATUS_VIEW.needs_changes.text).toBe('Нужны правки');
  });

  it('сообщения (2.7): заглушки', () => {
    expect(MESSAGE_STATUS_VIEW.deleted_by_author.text).toBe('Сообщение удалено автором');
    expect(MESSAGE_STATUS_VIEW.hidden_by_moderator.text).toBe('Скрыто модератором');
    expect(MESSAGE_STATUS_VIEW.deleted_by_moderator.text).toBe('Удалено модератором');
  });
});

describe('participationStatusText', () => {
  it('лист ожидания с позицией', () => {
    expect(participationStatusText('waitlist', 2)).toBe('Вы в листе ожидания, ваша позиция: 2');
  });

  it('без позиции и для остальных статусов — текст из таблицы', () => {
    expect(participationStatusText('waitlist')).toBe('Вы в листе ожидания');
    expect(participationStatusText('confirmed', 2)).toBe('Вы участник');
  });
});

describe('toneTokens', () => {
  it('имена CSS-токенов цвета текста и подложки', () => {
    expect(toneTokens('queue')).toEqual({ fg: '--status-queue-fg', bg: '--status-queue-bg' });
  });
});
