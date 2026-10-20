import type { ErrorCode } from '@tandem/domain';
import { describe, expect, it } from 'vitest';
import {
  canCreateEvent,
  canDecideParticipation,
  canEditOrganization,
  canEditMessage,
  canJoin,
  canLeave,
  canManageEvent,
  canModerate,
  canPostMessage,
  canSeeParticipantInfo,
  canViewEvent,
  canViewParticipants,
  eventActions,
  participationActions,
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

  describe('отменить свою запись или заявку', () => {
    it('гость — после входа; организация и администратор — нет', () => {
      expect(canLeave(guest, userEvent, now)).toEqual(loginFirst);
      expect(canLeave(orgApproved, userEvent, now)).toEqual(no('users_only'));
      expect(canLeave(admin, userEvent, now)).toEqual(no('users_only'));
    });
    it('только у опубликованного и не завершённого (ТЗ 4.3, 2.10)', () => {
      const finished = { ...userEvent, endsAt: new Date('2026-10-19T04:59:59Z') };
      expect(canLeave(user, userEvent, now)).toEqual(yes);
      for (const status of ['cancelled', 'unpublished', 'deleted'] as const) {
        expect(canLeave(user, { ...userEvent, status }, now), status).toEqual(
          no('event_not_joinable'),
        );
      }
      expect(canLeave(user, finished, now)).toEqual(no('event_not_joinable'));
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

  describe('смотреть участников и заявки события', () => {
    it('организатор и администратор — да, гость — после входа', () => {
      expect(canViewParticipants(author, userEvent)).toEqual(yes);
      expect(canViewParticipants(orgApproved, orgEvent)).toEqual(yes);
      expect(canViewParticipants(admin, userEvent)).toEqual(yes);
      expect(canViewParticipants(guest, userEvent)).toEqual(loginFirst);
    });
    it('участник и другая организация — нет', () => {
      expect(canViewParticipants(user, userEvent)).toEqual(no('not_event_organizer'));
      expect(canViewParticipants(orgPending, orgEvent)).toEqual(no('not_event_organizer'));
    });
  });

  describe('решение по заявке', () => {
    it('только организатор, у опубликованного и не завершившегося', () => {
      expect(canDecideParticipation(author, userEvent, now)).toEqual(yes);
      expect(canDecideParticipation(orgApproved, orgEvent, now)).toEqual(yes);
    });
    it('у администратора этого действия нет (ТЗ 2.4)', () => {
      expect(canDecideParticipation(admin, userEvent, now)).toEqual(no('not_event_organizer'));
      expect(canDecideParticipation(user, userEvent, now)).toEqual(no('not_event_organizer'));
      expect(canDecideParticipation(guest, userEvent, now)).toEqual(loginFirst);
    });
    it('снятое, отменённое, удалённое и завершившееся — нельзя', () => {
      for (const status of ['unpublished', 'cancelled', 'deleted'] as const) {
        expect(canDecideParticipation(author, { ...userEvent, status }, now), status).toEqual(
          no('event_not_joinable'),
        );
      }
      expect(canDecideParticipation(author, userEvent, userEvent.endsAt)).toEqual(
        no('event_not_joinable'),
      );
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

  describe('править и удалять своё сообщение', () => {
    const own = { authorUserId: 'u-anna' };
    const byOrg = { authorUserId: 'u-ladya' };
    it('гость — после входа', () => {
      expect(canEditMessage(guest, userEvent, own)).toEqual(loginFirst);
    });
    it('автор — да, остальные — нет', () => {
      expect(canEditMessage(user, userEvent, own)).toEqual(yes);
      expect(canEditMessage(author, userEvent, own)).toEqual(no('not_message_author'));
      expect(canEditMessage(admin, userEvent, own)).toEqual(no('not_message_author'));
    });
    it('организация — своё и только при approved', () => {
      expect(canEditMessage(orgApproved, userEvent, byOrg)).toEqual(yes);
      expect(canEditMessage(orgApproved, userEvent, own)).toEqual(no('not_message_author'));
      const byPadel = { authorUserId: 'u-padel' };
      expect(canEditMessage(orgPending, userEvent, byPadel)).toEqual(
        no('organization_not_approved'),
      );
    });
    it('в снятом и удалённом мероприятии — нельзя и автору (ТЗ 2.10)', () => {
      for (const status of ['unpublished', 'deleted'] as const) {
        expect(canEditMessage(user, { ...userEvent, status }, own), status).toEqual(
          no('event_not_available'),
        );
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

  it('пользователь может записаться; после отмены — снова, после отказа — нет, с причиной', () => {
    expect(card(user)[0]).toEqual({ code: 'join', enabled: true });
    expect(card(user, 'cancelled')[0]).toEqual({ code: 'join', enabled: true });
    expect(card(user, 'rejected')[0]).toEqual({
      code: 'join',
      enabled: false,
      reason: 'После отказа повторная заявка на это мероприятие недоступна',
    });
  });

  it.each(['pending', 'confirmed', 'waitlist'] as const)(
    'запись %s: «Отменить запись» вместо «Записаться»',
    (status) => {
      const actions = card(user, status);
      expect(actions[0]).toEqual({ code: 'leave', enabled: true });
      expect(actions.map((action) => action.code)).not.toContain('join');
    },
  );

  it('после окончания и вне публикации отмена записи неактивна — с причиной', () => {
    const ended = new Date(userEvent.endsAt.getTime() + 60_000);
    const event = { ...userEvent, mode: 'free' as const, hasSeats: true };
    expect(eventActions(user, event, 'confirmed', ended)[0]).toEqual({
      code: 'leave',
      enabled: false,
      reason: 'Мероприятие недоступно для записи',
    });
    expect(
      eventActions(user, { ...event, status: 'cancelled' }, 'confirmed', now)[0],
    ).toMatchObject({ code: 'leave', enabled: false });
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

describe('actions[]: заявка в «Участниках и заявках»', () => {
  const item = (
    actor: Actor,
    status: Parameters<typeof participationActions>[2],
    hasSeats = true,
  ) => participationActions(actor, { ...userEvent, mode: 'approval', hasSeats }, status, now);

  it('организатору у заявки — принять и отклонить', () => {
    expect(item(author, 'pending')).toEqual([
      { code: 'accept_participation', enabled: true },
      { code: 'reject_participation', enabled: true },
    ]);
  });

  it('мест нет — «Принять» неактивно с подсказкой из ТЗ 2.4', () => {
    expect(item(author, 'pending', false)[0]).toEqual({
      code: 'accept_participation',
      enabled: false,
      reason: 'Мест нет: увеличьте лимит или дождитесь отмены',
    });
  });

  it('у администратора и чужих действий нет, у рассмотренных записей — тоже', () => {
    expect(item(admin, 'pending')).toEqual([]);
    expect(item(user, 'pending')).toEqual([]);
    for (const status of ['confirmed', 'rejected', 'cancelled', 'waitlist'] as const) {
      expect(item(author, status), status).toEqual([]);
    }
  });

  it('у завершившегося мероприятия — неактивны с причиной', () => {
    const finished = participationActions(
      author,
      { ...userEvent, mode: 'approval', hasSeats: true },
      'pending',
      userEvent.endsAt,
    );
    expect(finished.map((action) => action.enabled)).toEqual([false, false]);
    expect(finished[0]?.reason).toBe('Мероприятие недоступно для записи');
  });
});
