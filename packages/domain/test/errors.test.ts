import { describe, expect, it } from 'vitest';
import {
  ACTION_CODES,
  ERROR_CODES,
  ERROR_HTTP_STATUS,
  ERROR_MESSAGES,
  TRANSITION_ERROR_CODES,
  errorMessage,
} from '../src';

describe('errors: закрытый список кодов ошибок API', () => {
  it('коды не повторяются', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });

  it('включает все коды отказов автоматов', () => {
    for (const code of TRANSITION_ERROR_CODES) expect(ERROR_CODES).toContain(code);
  });

  it('у каждого кода — текст по-русски, а лишних текстов нет', () => {
    expect(Object.keys(ERROR_MESSAGES).sort()).toEqual([...ERROR_CODES].sort());
    for (const code of ERROR_CODES) {
      expect(ERROR_MESSAGES[code], code).toMatch(/^[А-ЯЁ][^a-zA-Z]*$/);
    }
  });

  it('у каждого кода — HTTP-статус из допустимых', () => {
    expect(Object.keys(ERROR_HTTP_STATUS).sort()).toEqual([...ERROR_CODES].sort());
    for (const code of ERROR_CODES) {
      expect([400, 401, 403, 404, 409, 413, 415, 500, 503], code).toContain(
        ERROR_HTTP_STATUS[code],
      );
    }
  });

  it('статусы ключевых ошибок, на которые опираются сценарии проверки', () => {
    expect(ERROR_HTTP_STATUS).toMatchObject({
      unsupported_media_type: 415,
      cross_site_request: 403,
      validation_failed: 400,
      unauthorized: 401,
      forbidden: 403,
      not_found: 404,
      event_not_available: 404,
      // docs/scenarios.md, сценарий 6: запись на снятое мероприятие
      event_not_joinable: 409,
      internal: 500,
    });
  });

  it('errorMessage возвращает текст кода', () => {
    expect(errorMessage('event_not_joinable')).toBe('Мероприятие недоступно для записи');
    expect(errorMessage('unauthorized')).toBe('Войдите, чтобы продолжить');
  });
});

describe('actions: закрытый список действий для actions[]', () => {
  it('коды не повторяются', () => {
    expect(new Set(ACTION_CODES).size).toBe(ACTION_CODES.length);
  });

  it('покрывает действия таблицы политик ТЗ 4.4', () => {
    expect(ACTION_CODES).toEqual(
      expect.arrayContaining([
        'join',
        'leave',
        'create_event',
        'accept_participation',
        'reject_participation',
        'reschedule_event',
        'cancel_event',
        'post_message',
        'edit_organization',
        'submit_organization',
        'hide_message',
        'delete_message',
        'unpublish_event',
        'delete_event',
        'restore_event',
        'review_organization',
        'manage_catalog',
      ]),
    );
  });
});
