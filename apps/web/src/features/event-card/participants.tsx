import { PARTICIPATION_STATUS_VIEW } from '@tandem/domain';
import type { Action, ParticipationStatus } from '@tandem/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiRequestError, apiRequest } from '../../shared/api';
import { StatusBadge, TextAreaField } from '../../shared/ui';
import { eventCardKey } from './api';
import { findAction } from './actions';

/** Запись в «Участниках и заявках» — как её отдаёт `GET /events/:id/participants`. */
interface Participant {
  id: string;
  status: ParticipationStatus;
  user: { id: string; name: string };
  answer: string | null;
  decisionReason: string | null;
  actions: Action[];
}

interface ParticipantsList {
  pending: Participant[];
  confirmed: Participant[];
  waitlist: Participant[];
  archive: Participant[];
}

// Статусы записи в domain — глазами самого участника («Вы отменили запись»); организатору
// в архиве — о записи. У участников и листа ожидания раздел говорит сам за себя
const ARCHIVE_VIEW = {
  rejected: PARTICIPATION_STATUS_VIEW.rejected,
  cancelled: { ...PARTICIPATION_STATUS_VIEW.cancelled, text: 'Запись отменена' },
};

const participantsKey = (eventId: string) => ['event', eventId, 'participants'] as const;

function useParticipants(eventId: string, enabled: boolean) {
  return useQuery({
    queryKey: participantsKey(eventId),
    queryFn: () =>
      apiRequest<ParticipantsList>(`/events/${encodeURIComponent(eventId)}/participants`),
    enabled,
  });
}

/** Решение по заявке; после него — перечитать и список, и карточку (места, статус). */
function useDecision(eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      participationId,
      decision,
      reason,
    }: {
      participationId: string;
      decision: 'accept' | 'reject';
      reason?: string;
    }) =>
      apiRequest<unknown>(`/participations/${encodeURIComponent(participationId)}/${decision}`, {
        method: 'POST',
        body: reason ? { reason } : {},
      }),
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: participantsKey(eventId) }),
        client.invalidateQueries({ queryKey: eventCardKey(eventId), exact: true }),
      ]),
  });
}

const errorText = (error: unknown) =>
  error instanceof ApiRequestError
    ? (Object.values(error.fields)[0] ?? error.message)
    : 'Не получилось. Попробуйте ещё раз';

/** «Принять» и «Отклонить» с необязательной причиной — по `actions[]` записи. */
function Decision({ eventId, participant }: { eventId: string; participant: Participant }) {
  const decision = useDecision(eventId);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const hintId = useId();
  const accept = findAction(participant.actions, 'accept_participation');
  const reject = findAction(participant.actions, 'reject_participation');
  const submitReject = (form: FormEvent) => {
    form.preventDefault();
    decision.mutate({ participationId: participant.id, decision: 'reject', reason: reason.trim() });
  };
  return (
    <div className="participant-decision">
      <div className="participant-buttons">
        {accept && (
          <button
            className="button button-primary"
            type="button"
            disabled={!accept.enabled || decision.isPending}
            aria-describedby={accept.enabled ? undefined : hintId}
            onClick={() => decision.mutate({ participationId: participant.id, decision: 'accept' })}
          >
            Принять
          </button>
        )}
        {reject && !rejecting && (
          <button
            className="button"
            type="button"
            disabled={!reject.enabled || decision.isPending}
            onClick={() => setRejecting(true)}
          >
            Отклонить
          </button>
        )}
      </div>
      {accept && !accept.enabled && accept.reason && (
        <p className="participant-hint" id={hintId}>
          {accept.reason}
        </p>
      )}
      {rejecting && (
        <form className="participant-reject" onSubmit={submitReject}>
          <TextAreaField
            label="Причина (необязательно)"
            value={reason}
            maxLength={500}
            rows={2}
            autoFocus
            onChange={(change) => setReason(change.target.value)}
          />
          <div className="participant-buttons">
            <button className="button button-primary" type="submit" disabled={decision.isPending}>
              Отклонить заявку
            </button>
            <button className="button" type="button" onClick={() => setRejecting(false)}>
              Отмена
            </button>
          </div>
        </form>
      )}
      {decision.error && (
        <p className="form-error" role="alert">
          {errorText(decision.error)}
        </p>
      )}
    </div>
  );
}

function Group({
  title,
  people,
  eventId,
  empty,
}: {
  title: string;
  people: Participant[];
  eventId: string;
  empty: string;
}) {
  const titleId = useId();
  return (
    <section className="participants-group" aria-labelledby={titleId}>
      <h2 id={titleId}>
        {title} <span className="participants-count">{people.length}</span>
      </h2>
      {people.length === 0 ? (
        <p className="participants-empty">{empty}</p>
      ) : (
        <ul className="participants-list">
          {people.map((person) => (
            <li key={person.id} className="participant">
              <span className="participant-name">{person.user.name}</span>
              {(person.status === 'rejected' || person.status === 'cancelled') && (
                <StatusBadge
                  view={ARCHIVE_VIEW[person.status]}
                  reason={person.status === 'rejected' ? person.decisionReason : null}
                  compact
                />
              )}
              {person.answer && (
                <p className="participant-answer">
                  <span className="visually-hidden">Ответ: </span>
                  {person.answer}
                </p>
              )}
              {person.actions.length > 0 && <Decision eventId={eventId} participant={person} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * «Участники и заявки» организатора (ТЗ 2.4, 2.5): «Ждут решения» с ответом на вопрос,
 * «Участники», лист ожидания и архив. Кнопки — только по `actions[]` записи.
 */
export function ParticipantsPanel({ eventId, active }: { eventId: string; active: boolean }) {
  const list = useParticipants(eventId, active);
  if (list.isPending) return <p role="status">Загрузка…</p>;
  if (list.isError) {
    return (
      <p className="form-error" role="alert">
        {errorText(list.error)}
      </p>
    );
  }
  const { pending, confirmed, waitlist, archive } = list.data;
  return (
    <div className="participants">
      <Group title="Ждут решения" people={pending} eventId={eventId} empty="Новых заявок нет" />
      <Group title="Участники" people={confirmed} eventId={eventId} empty="Пока никто не записан" />
      {waitlist.length > 0 && (
        <Group title="Лист ожидания" people={waitlist} eventId={eventId} empty="" />
      )}
      <Group
        title="Архив"
        people={archive}
        eventId={eventId}
        empty="Отклонённых и отменённых записей нет"
      />
    </div>
  );
}
