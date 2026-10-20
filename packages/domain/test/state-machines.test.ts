import { describe, expect, it } from 'vitest';
import {
  EVENT_ACTIONS,
  EVENT_STATUSES,
  MESSAGE_ACTIONS,
  MESSAGE_STATUSES,
  ORGANIZATION_ACTIONS,
  ORGANIZATION_STATUSES,
  PARTICIPATION_ACTIONS,
  PARTICIPATION_STATUSES,
  TransitionError,
  eventMachine,
  messageMachine,
  organizationMachine,
  participationMachine,
} from '../src';
import type { Machine } from '../src';

type Table<S extends string, A extends string> = Record<A, Partial<Record<S | 'none', S>>>;

const key = <S extends string>(from: S | null) => from ?? 'none';

/**
 * Проверяет все пары «статус × действие»: разрешённые из таблицы дают
 * ожидаемый статус, все остальные — запрещены и бросают TransitionError.
 */
function checkAllPairs<S extends string, A extends string, C>(
  machine: Machine<S, A, C>,
  statuses: readonly S[],
  actions: readonly A[],
  table: Table<S, A>,
  ctx: C,
) {
  for (const action of actions) {
    for (const from of [null, ...statuses]) {
      const expected = table[action][key(from)];
      const label = `${key(from)} --${action}-->`;
      if (expected) {
        expect(machine.canTransition(from, action, ctx), label).toBe(true);
        expect(machine.nextState(from, action, ctx), label).toBe(expected);
      } else {
        expect(machine.canTransition(from, action, ctx), label).toBe(false);
        expect(() => machine.nextState(from, action, ctx), label).toThrow(TransitionError);
      }
    }
  }
}

function errorOf(fn: () => unknown): TransitionError {
  try {
    fn();
  } catch (error) {
    if (error instanceof TransitionError) return error;
    throw error;
  }
  throw new Error('ожидалась ошибка перехода');
}

describe('автомат записи (Participation)', () => {
  const free = { mode: 'free', hasSeats: true } as const;

  it('все переходы по таблице 4.3, остальные запрещены', () => {
    checkAllPairs(
      participationMachine,
      PARTICIPATION_STATUSES,
      PARTICIPATION_ACTIONS,
      {
        join: { none: 'confirmed', cancelled: 'confirmed' },
        accept: { pending: 'confirmed' },
        reject: { pending: 'rejected' },
        promote: { waitlist: 'confirmed' },
        cancel: { pending: 'cancelled', confirmed: 'cancelled', waitlist: 'cancelled' },
      },
      free,
    );
  });

  it('свободный режим: есть места — сразу участник', () => {
    expect(participationMachine.nextState(null, 'join', { mode: 'free', hasSeats: true })).toBe(
      'confirmed',
    );
  });

  it('свободный режим: мест нет — лист ожидания', () => {
    expect(participationMachine.nextState(null, 'join', { mode: 'free', hasSeats: false })).toBe(
      'waitlist',
    );
  });

  it('по заявке — заявка на рассмотрении, даже если мест нет', () => {
    expect(participationMachine.nextState(null, 'join', { mode: 'approval', hasSeats: true })).toBe(
      'pending',
    );
    expect(
      participationMachine.nextState(null, 'join', { mode: 'approval', hasSeats: false }),
    ).toBe('pending');
  });

  it('после своей отмены можно записаться снова', () => {
    expect(
      participationMachine.nextState('cancelled', 'join', { mode: 'approval', hasSeats: true }),
    ).toBe('pending');
  });

  it('после отказа повторная заявка запрещена с понятным текстом', () => {
    const error = errorOf(() => participationMachine.nextState('rejected', 'join', free));
    expect(error.code).toBe('rejected_final');
    expect(error.message).toBe('После отказа повторная заявка на это мероприятие недоступна');
  });

  it('повторная запись при активной записи запрещена', () => {
    for (const from of ['pending', 'confirmed', 'waitlist'] as const) {
      const error = errorOf(() => participationMachine.nextState(from, 'join', free));
      expect(error.code, from).toBe('already_joined');
      expect(error.message, from).toBe('Вы уже записаны на это мероприятие');
    }
  });

  it('принять заявку без свободных мест нельзя', () => {
    const ctx = { mode: 'approval', hasSeats: false } as const;
    expect(participationMachine.canTransition('pending', 'accept', ctx)).toBe(false);
    const error = errorOf(() => participationMachine.nextState('pending', 'accept', ctx));
    expect(error.code).toBe('no_seats');
    expect(error.message).toBe('Мест нет: увеличьте лимит или дождитесь отмены');
  });

  it('из листа ожидания в участники — только при свободном месте', () => {
    expect(
      participationMachine.canTransition('waitlist', 'promote', { mode: 'free', hasSeats: false }),
    ).toBe(false);
    expect(
      errorOf(() =>
        participationMachine.nextState('waitlist', 'promote', { mode: 'free', hasSeats: false }),
      ).code,
    ).toBe('no_seats');
  });

  it('отклонить и отменить можно и без свободных мест', () => {
    const ctx = { mode: 'approval', hasSeats: false } as const;
    expect(participationMachine.nextState('pending', 'reject', ctx)).toBe('rejected');
    expect(participationMachine.nextState('confirmed', 'cancel', ctx)).toBe('cancelled');
  });

  it('запрещённый переход объясняет, что не так, и называет автомат, статус и действие', () => {
    const error = errorOf(() => participationMachine.nextState('confirmed', 'accept', free));
    expect(error.code).toBe('invalid_transition');
    expect(error.message).toBe('Заявка уже рассмотрена или отменена');
    expect(error).toMatchObject({ machine: 'participation', from: 'confirmed', action: 'accept' });
  });
});

describe('автомат мероприятия (Event)', () => {
  const now = new Date('2026-10-19T10:00:00Z');
  const future = new Date('2026-10-21T10:00:00Z');
  const ok = {
    now,
    startsAt: future,
    newStartsAt: new Date('2026-10-22T10:00:00Z'),
    reason: 'Причина',
  };

  it('все переходы по таблице 4.3, остальные запрещены', () => {
    checkAllPairs(
      eventMachine,
      EVENT_STATUSES,
      EVENT_ACTIONS,
      {
        publish: { none: 'published' },
        edit: { published: 'published' },
        reschedule: { published: 'published' },
        cancel: { published: 'cancelled' },
        unpublish: { published: 'unpublished' },
        delete: { published: 'deleted', unpublished: 'deleted', cancelled: 'deleted' },
        restore: { unpublished: 'published' },
      },
      ok,
    );
  });

  it('опубликовать можно только с началом в будущем', () => {
    const error = errorOf(() => eventMachine.nextState(null, 'publish', { now, startsAt: now }));
    expect(error.code).toBe('start_not_in_future');
    expect(error.message).toBe('Время начала должно быть в будущем');
  });

  it('изменить, перенести и отменить можно только до начала', () => {
    const started = { ...ok, startsAt: new Date('2026-10-19T09:00:00Z') };
    for (const action of ['edit', 'reschedule', 'cancel'] as const) {
      expect(eventMachine.canTransition('published', action, started), action).toBe(false);
      const error = errorOf(() => eventMachine.nextState('published', action, started));
      expect(error.code, action).toBe('event_started');
      expect(error.message, action).toBe('Мероприятие уже началось: изменить его нельзя');
    }
  });

  it('ровно в момент начала мероприятие уже началось', () => {
    expect(eventMachine.canTransition('published', 'cancel', { ...ok, startsAt: now })).toBe(false);
  });

  it('новое время начала при переносе — только в будущем', () => {
    const error = errorOf(() =>
      eventMachine.nextState('published', 'reschedule', { ...ok, newStartsAt: now }),
    );
    expect(error.code).toBe('start_not_in_future');
  });

  it('перенос без нового времени начала запрещён', () => {
    expect(
      eventMachine.canTransition('published', 'reschedule', { ...ok, newStartsAt: undefined }),
    ).toBe(false);
  });

  it('отмена, снятие и удаление требуют причину', () => {
    for (const [from, action] of [
      ['published', 'cancel'],
      ['published', 'unpublish'],
      ['unpublished', 'delete'],
    ] as const) {
      for (const reason of [undefined, '', '   ']) {
        const error = errorOf(() => eventMachine.nextState(from, action, { ...ok, reason }));
        expect(error.code, `${action} «${reason}»`).toBe('reason_required');
        expect(error.message).toBe('Укажите причину');
      }
    }
  });

  it('снять с публикации и удалить администратор может и после начала', () => {
    const started = { ...ok, startsAt: new Date('2026-10-19T09:00:00Z') };
    expect(eventMachine.nextState('published', 'unpublish', started)).toBe('unpublished');
    expect(eventMachine.nextState('published', 'delete', started)).toBe('deleted');
  });

  it('удалённое мероприятие не восстанавливается', () => {
    const error = errorOf(() => eventMachine.nextState('deleted', 'restore', ok));
    expect(error.code).toBe('invalid_transition');
    expect(error.message).toBe('Восстановить можно только снятое с публикации мероприятие');
  });
});

describe('автомат организации (Organization)', () => {
  const withReason = { reason: 'Не указан представитель' };

  it('все переходы по таблице 4.3, остальные запрещены', () => {
    checkAllPairs(
      organizationMachine,
      ORGANIZATION_STATUSES,
      ORGANIZATION_ACTIONS,
      {
        create: { none: 'draft' },
        submit: { draft: 'pending', rejected: 'pending', needs_changes: 'pending' },
        approve: { pending: 'approved' },
        reject: { pending: 'rejected' },
        request_changes: { pending: 'needs_changes' },
      },
      withReason,
    );
  });

  it('отклонение и возврат на доработку требуют причину или комментарий', () => {
    for (const action of ['reject', 'request_changes'] as const) {
      expect(errorOf(() => organizationMachine.nextState('pending', action, {})).code, action).toBe(
        'reason_required',
      );
    }
  });

  it('одобрение не требует причины', () => {
    expect(organizationMachine.nextState('pending', 'approve', {})).toBe('approved');
  });

  it('одобренная организация — конечный статус', () => {
    expect(organizationMachine.canTransition('approved', 'submit', withReason)).toBe(false);
    expect(
      errorOf(() => organizationMachine.nextState('approved', 'submit', withReason)).message,
    ).toBe('Заявка уже на проверке или одобрена');
  });
});

describe('автомат сообщения (Message)', () => {
  const withReason = { reason: 'Оскорбление' };

  it('все переходы по таблице 4.3, остальные запрещены', () => {
    checkAllPairs(
      messageMachine,
      MESSAGE_STATUSES,
      MESSAGE_ACTIONS,
      {
        post: { none: 'visible' },
        hide: { visible: 'hidden_by_moderator' },
        delete_by_moderator: {
          visible: 'deleted_by_moderator',
          hidden_by_moderator: 'deleted_by_moderator',
        },
        delete_by_author: { visible: 'deleted_by_author' },
      },
      withReason,
    );
  });

  it('скрытие и удаление модератором требуют причину, удаление автором — нет', () => {
    expect(errorOf(() => messageMachine.nextState('visible', 'hide', {})).code).toBe(
      'reason_required',
    );
    expect(errorOf(() => messageMachine.nextState('visible', 'delete_by_moderator', {})).code).toBe(
      'reason_required',
    );
    expect(messageMachine.nextState('visible', 'delete_by_author', {})).toBe('deleted_by_author');
  });
});
