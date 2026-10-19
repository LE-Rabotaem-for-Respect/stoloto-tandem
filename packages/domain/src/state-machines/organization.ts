import { defineMachine, reasonRequired } from './machine';

export const ORGANIZATION_STATUSES = [
  'draft',
  'pending',
  'approved',
  'rejected',
  'needs_changes',
] as const;
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];

export const ORGANIZATION_ACTIONS = [
  'create',
  'submit',
  'approve',
  'reject',
  'request_changes',
] as const;
export type OrganizationAction = (typeof ORGANIZATION_ACTIONS)[number];

export interface OrganizationContext {
  /** Причина отклонения или комментарий при возврате на доработку. */
  reason?: string;
}

const decisionOnlyOnPending = 'Решение принимается только по заявке на проверке';

const deniedMessages: Record<OrganizationAction, string> = {
  create: 'Профиль организации уже создан',
  submit: 'Заявка уже на проверке или одобрена',
  approve: decisionOnlyOnPending,
  reject: decisionOnlyOnPending,
  request_changes: decisionOnlyOnPending,
};

/** Организация (ТЗ 4.3, 2.9). `approved` — конечный статус: отзыв допуска в прототипе не реализуется. */
export const organizationMachine = defineMachine<
  OrganizationStatus,
  OrganizationAction,
  OrganizationContext
>({
  name: 'organization',
  rules: [
    { action: 'create', from: [null], to: 'draft' },
    { action: 'submit', from: ['draft', 'rejected', 'needs_changes'], to: 'pending' },
    { action: 'approve', from: ['pending'], to: 'approved' },
    { action: 'reject', from: ['pending'], to: 'rejected', guards: [reasonRequired] },
    { action: 'request_changes', from: ['pending'], to: 'needs_changes', guards: [reasonRequired] },
  ],
  denied: (_from, action) => ({ code: 'invalid_transition', message: deniedMessages[action] }),
});
