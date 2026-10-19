export type TransitionErrorCode =
  | 'invalid_transition'
  | 'already_joined'
  | 'rejected_final'
  | 'no_seats'
  | 'reason_required'
  | 'event_started'
  | 'start_not_in_future';

/** Запрещённый переход автомата. `message` — готовый текст для пользователя. */
export class TransitionError extends Error {
  override readonly name = 'TransitionError';

  constructor(
    readonly code: TransitionErrorCode,
    message: string,
    readonly machine: string,
    readonly from: string | null,
    readonly action: string,
  ) {
    super(message);
  }
}

/** Отказ условия перехода: код и текст для пользователя. */
export interface Denial {
  code: TransitionErrorCode;
  message: string;
}

export interface Rule<S extends string, A extends string, C> {
  action: A;
  /** `null` — объекта ещё нет (создание). */
  from: readonly (S | null)[];
  to: S | ((ctx: C) => S);
  /** Условия перехода по порядку; первое невыполненное даёт отказ. */
  guards?: readonly ((ctx: C) => Denial | undefined)[];
}

export interface MachineDefinition<S extends string, A extends string, C> {
  name: string;
  rules: readonly Rule<S, A, C>[];
  /** Отказ, когда действие недоступно из текущего статуса. */
  denied: (from: S | null, action: A) => Denial;
}

export type TransitionResult<S> = { ok: true; to: S } | { ok: false; error: TransitionError };

export interface Machine<S extends string, A extends string, C> {
  readonly name: string;
  check(from: S | null, action: A, ctx: C): TransitionResult<S>;
  canTransition(from: S | null, action: A, ctx: C): boolean;
  /** Следующий статус; запрещённый переход бросает `TransitionError`. */
  nextState(from: S | null, action: A, ctx: C): S;
}

export function defineMachine<S extends string, A extends string, C>(
  definition: MachineDefinition<S, A, C>,
): Machine<S, A, C> {
  const fail = (from: S | null, action: A, { code, message }: Denial): TransitionResult<S> => ({
    ok: false,
    error: new TransitionError(code, message, definition.name, from, action),
  });

  const check = (from: S | null, action: A, ctx: C): TransitionResult<S> => {
    const rule = definition.rules.find((r) => r.action === action && r.from.includes(from));
    if (!rule) return fail(from, action, definition.denied(from, action));
    for (const guard of rule.guards ?? []) {
      const denial = guard(ctx);
      if (denial) return fail(from, action, denial);
    }
    return { ok: true, to: typeof rule.to === 'function' ? rule.to(ctx) : rule.to };
  };

  return {
    name: definition.name,
    check,
    canTransition: (from, action, ctx) => check(from, action, ctx).ok,
    nextState: (from, action, ctx) => {
      const result = check(from, action, ctx);
      if (!result.ok) throw result.error;
      return result.to;
    },
  };
}

/** Условие «причина указана»: пустая строка и пробелы не считаются причиной. */
export const reasonRequired = (ctx: { reason?: string }): Denial | undefined =>
  ctx.reason?.trim() ? undefined : { code: 'reason_required', message: 'Укажите причину' };
