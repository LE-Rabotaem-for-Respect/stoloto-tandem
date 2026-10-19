import type { ErrorCode } from '@tandem/domain';
import { describe, expect, it } from 'vitest';
import {
  canCreateEvent,
  canEditOrganization,
  canJoin,
  canManageEvent,
  canModerate,
  canPostMessage,
  canSeeParticipantInfo,
  canViewEvent,
  eventActions,
} from '../src/core/policies';
import type { Actor, Decision, PolicyEvent } from '../src/core/policies';

const now = new Date('2026-10-19T05:00:00Z');

const guest: Actor = { role: 'guest' };
const user: Actor = { role: 'user', userId: 'u-anna' };
const author: Actor = { role: 'user', userId: 'u-igor' };
const orgApproved: Actor = {
  role: 'org',
  userId: 'u-ladya',
  organization: { id: 'o-ladya', status: 'approved' },
};
const orgPending: Actor = {
  role: 'org',
  userId: 'u-padel',
  organization: { id: 'o-padel', status: 'pending' },
};
const admin: Actor = { role: 'admin', userId: 'u-admin' };

const userEvent: PolicyEvent = {
  status: 'published',
  startsAt: new Date('2026-10-21T12:00:00Z'),
  endsAt: new Date('2026-10-21T13:30:00Z'),
  organizerUserId: 'u-igor',
  organizerOrgId: null,
};
const orgEvent: PolicyEvent = { ...userEvent, organizerUserId: null, organizerOrgId: 'o-ladya' };

const yes: Decision = { allowed: true };
const no = (code: ErrorCode, requiresAuth?: true): Decision =>
  requiresAuth ? { allowed: false, code, requiresAuth } : { allowed: false, code };
const loginFirst = no('unauthorized', true);

describe('policies по таблице ТЗ 4.4', () => {
  it('смотреть ленту, карточки и обсуждения опубликованных событий — все', () => {
    for (const actor of [guest, user, orgApproved, admin]) {
      expect(canViewEvent(actor, userEvent, null)).toEqual(yes);
    }
  });

  it('снятое с публикации видят организатор, записавшиеся и администратор', () => {
    const unpublished = { ...userEvent, status: 'unpublished' as const };
    expect(canViewEvent(guest, unpublished, null)).toEqual(no('event_not_available'));
    expect(canViewEvent(user, unpublished, null)).toEqual(no('event_not_available'));
    for (const status of ['pending', 'confirmed', 'waitlist'] as const) {
      expect(canViewEvent(user, unpublished, status), status).toEqual(yes);
    }
    for (const status of ['rejected', 'cancelled'] as const) {
      expect(canViewEvent(user, unpublished, status), status).toEqual(no('event_not_available'));
    }
    expect(canViewEvent(author, unpublished, null)).toEqual(yes);
    expect(canViewEvent(admin, unpublished, null)).toEqual(yes);
  });

  it('удалённое модератором — так же, как снятое', () => {
    const deleted = { ...userEvent, status: 'deleted' as const };
    expect(canViewEvent(guest, deleted, null)).toEqual(no('event_not_available'));
    expect(canViewEvent(user, deleted, 'cancelled')).toEqual(no('event_not_available'));
    expect(canViewEvent(user, deleted, 'confirmed')).toEqual(yes);
    expect(canViewEvent(author, deleted, null)).toEqual(yes);
    expect(canViewEvent(admin, deleted, null)).toEqual(yes);
  });

  describe('записаться, подать заявку, встать в лист ожидания', () => {
    it('гость — после входа', () => {
      expect(canJoin(guest, userEvent, now)).toEqual(loginFirst);
    });
    it('пользователь — да, но не на своё', () => {
      expect(canJoin(user, userEvent, now)).toEqual(yes);
      expect(canJoin(author, userEvent, now)).toEqual(no('own_event'));
    });
    it('организация и администратор — нет', () => {
      expect(canJoin(orgApproved, userEvent, now)).toEqual(no('users_only'));
      expect(canJoin(admin, userEvent, now)).toEqual(no('users_only'));
    });
    it('только на опубликованное и не завершённое', () => {
      const finished = { ...userEvent, endsAt: new Date('2026-10-19T04:59:59Z') };
      const ongoing = { ...userEvent, startsAt: new Date('2026-10-19T04:00:00Z') };
      for (const status of ['cancelled', 'unpublished', 'deleted'] as const) {
        expect(canJoin(user, { ...userEvent, status }, now), status).toEqual(
          no('event_not_joinable'),
        );
      }
      expect(canJoin(user, finished, now)).toEqual(no('event_not_joinable'));
      expect(canJoin(user, ongoing, now)).toEqual(yes);
    });
  });

  describe('видеть «Информацию для участников»', () => {
    it('гость — нет', () => {
      expect(canSeeParticipantInfo(guest, userEvent, null)).toEqual(loginFirst);
    });
    it('пользователь — подтверждённый участник или организатор', () => {
      expect(canSeeParticipantInfo(user, userEvent, 'confirmed')).toEqual(yes);
      expect(canSeeParticipantInfo(author, userEvent, null)).toEqual(yes);
      for (const status of [null, 'pending', 'waitlist', 'rejected', 'cancelled'] as const) {
        expect(canSeeParticipantInfo(user, userEvent, status), String(status)).toEqual(
          no('participants_only'),
        );
      }
    });
    it('организация — организатор', () => {
      expect(canSeeParticipantInfo(orgApproved, orgEvent, null)).toEqual(yes);
      expect(canSeeParticipantInfo(orgApproved, userEvent, null)).toEqual(no('participants_only'));
    });
    it('администратор — да', () => {
      expect(canSeeParticipantInfo(admin, userEvent, null)).toEqual(yes);
    });
  });

  describe('создать мероприятие', () => {
    it('гость — после входа', () => {
      expect(canCreateEvent(guest)).toEqual(loginFirst);
    });
    it('пользователь — от себя', () => {
      expect(canCreateEvent(user)).toEqual(yes);
    });
    it('организация — только при approved', () => {
      expect(canCreateEvent(orgApproved)).toEqual(yes);
      expect(canCreateEvent(orgPending)).toEqual(no('organization_not_approved'));
    });
    it('администратор — нет', () => {
      expect(canCreateEvent(admin)).toEqual(no('forbidden'));
    });
  });

  describe('принять или отклонить заявку, перенести, отменить событие', () => {
    it('гость — после входа', () => {
      expect(canManageEvent(guest, userEvent)).toEqual(loginFirst);
    });
    it('пользователь — автор события', () => {
      expect(canManageEvent(author, userEvent)).toEqual(yes);
      expect(canManageEvent(user, userEvent)).toEqual(no('not_event_organizer'));
    });
    it('организация — автор события', () => {
      expect(canManageEvent(orgApproved, orgEvent)).toEqual(yes);
      expect(canManageEvent(orgPending, orgEvent)).toEqual(no('not_event_organizer'));
    });
    it('администратор — нет', () => {
      expect(canManageEvent(admin, userEvent)).toEqual(no('not_event_organizer'));
    });
  });

  describe('писать в обсуждение', () => {
    it('гость — после входа', () => {
      expect(canPostMessage(guest, userEvent)).toEqual(loginFirst);
    });
    it('пользователь — да', () => {
      expect(canPostMessage(user, userEvent)).toEqual(yes);
    });
    it('организация — только при approved', () => {
      expect(canPostMessage(orgApproved, userEvent)).toEqual(yes);
      expect(canPostMessage(orgPending, userEvent)).toEqual(no('organization_not_approved'));
    });
    it('администратор — нет', () => {
      expect(canPostMessage(admin, userEvent)).toEqual(no('forbidden'));
    });
    it('в снятое и удалённое — нельзя никому: новые действия заблокированы (ТЗ 2.10)', () => {
      const actors = { guest, user, author, orgApproved, orgPending, admin };
      for (const status of ['unpublished', 'deleted'] as const) {
        for (const base of [userEvent, orgEvent]) {
          const event = { ...base, status };
          for (const [name, actor] of Object.entries(actors)) {
            expect(canPostMessage(actor, event), `${name}, ${status}`).toEqual(
              no('event_not_available'),
            );
          }
        }
      }
    });
  });

  describe('редактировать профиль организации, отправить на проверку', () => {
    it('гость — после входа', () => {
      expect(canEditOrganization(guest, 'o-ladya')).toEqual(loginFirst);
    });
    it('только своя организация, в любом статусе', () => {
      expect(canEditOrganization(orgApproved, 'o-ladya')).toEqual(yes);
      expect(canEditOrganization(orgPending, 'o-padel')).toEqual(yes);
      expect(canEditOrganization(orgPending, 'o-ladya')).toEqual(no('not_organization_owner'));
    });
    it('пользователь и администратор — нет', () => {
      expect(canEditOrganization(user, 'o-ladya')).toEqual(no('not_organization_owner'));
      expect(canEditOrganization(admin, 'o-ladya')).toEqual(no('not_organization_owner'));
    });
  });

  it('модерация сообщений и мероприятий, заявки организаций, каталог — только администратор', () => {
    expect(canModerate(admin)).toEqual(yes);
    expect(canModerate(guest)).toEqual(loginFirst);
    for (const actor of [user, author, orgApproved]) {
      expect(canModerate(actor)).toEqual(no('admins_only'));
    }
  });
});

describe('actions[]: пример для карточки события', () => {
  const card = (actor: Actor, participation: Parameters<typeof eventActions>[2] = null) =>
    eventActions(actor, { ...userEvent, mode: 'free', hasSeats: true }, participation, now);

  it('гость видит запись и обсуждение с requiresAuth', () => {
    expect(card(guest)).toEqual([
      { code: 'join', enabled: false, requiresAuth: true, reason: 'Войдите, чтобы продолжить' },
      {
        code: 'post_message',
        enabled: false,
        requiresAuth: true,
        reason: 'Войдите, чтобы продолжить',
      },
    ]);
  });

  it('пользователь может записаться; уже записанный — нет, с причиной из автомата', () => {
    expect(card(user)[0]).toEqual({ code: 'join', enabled: true });
    expect(card(user, 'confirmed')[0]).toEqual({
      code: 'join',
      enabled: false,
      reason: expect.stringMatching(/[А-Яа-я]/),
    });
  });

  it('организатор получает управление событием, но не запись на своё', () => {
    const codes = card(author).map((action) => action.code);
    expect(codes).toEqual(['join', 'post_message', 'reschedule_event', 'cancel_event']);
    expect(card(author)[0]).toEqual({
      code: 'join',
      enabled: false,
      reason: 'Нельзя записаться на своё мероприятие',
    });
  });

  it('администратор получает модерацию, а не управление', () => {
    const codes = card(admin).map((action) => action.code);
    expect(codes).toEqual(['join', 'post_message', 'unpublish_event', 'delete_event']);
  });

  it('у снятого и удалённого мероприятия обсуждение неактивно для всех ролей (ТЗ 2.10)', () => {
    const unavailable = { code: 'post_message', enabled: false, reason: 'Мероприятие недоступно' };
    const actors = { guest, user, author, orgApproved, orgPending, admin };
    for (const status of ['unpublished', 'deleted'] as const) {
      for (const base of [userEvent, orgEvent]) {
        for (const [name, actor] of Object.entries(actors)) {
          const actions = eventActions(
            actor,
            { ...base, status, mode: 'free', hasSeats: true },
            null,
            now,
          );
          const postMessage = actions.find((action) => action.code === 'post_message');
          expect(postMessage, `${name}, ${status}`).toEqual(unavailable);
        }
      }
    }
  });
});
