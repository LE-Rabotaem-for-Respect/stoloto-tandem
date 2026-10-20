import { TIME_ZONE } from '@tandem/domain';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useMatch } from 'react-router';
import { ApiRequestError } from '../../shared/api';
import { useClock, useStandInfo } from '../../shared/clock';
import { useEventTimes, useResetDemo, useShiftClock } from './api';
import './demo-panel.css';

const HOUR = 3_600;
const DAY = 24 * HOUR;
// Чуть позже окончания: «Завершено» уже наступило, а не совпадает с ним
const AFTER_END_SECONDS = 60;

const dayFormat = new Intl.DateTimeFormat('ru-RU', {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'long',
});
const timeFormat = new Intl.DateTimeFormat('ru-RU', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
});
const krasnoyarsk = (date: Date) => `${dayFormat.format(date)}, ${timeFormat.format(date)}`;

type ShiftClock = ReturnType<typeof useShiftClock>;

// Отказ сервера с причиной в поле («Не больше чем на год вперёд») понятнее общего текста
const shiftError = (error: Error) =>
  (error instanceof ApiRequestError && error.fields.addSeconds) || error.message;

/** На странице мероприятия — перевести часы стенда за его окончание. */
function FinishEvent({ eventId, now, shift }: { eventId: string; now: Date; shift: ShiftClock }) {
  const event = useEventTimes(eventId);
  if (event.isError) {
    return (
      <span className="demo-note">Не удалось загрузить мероприятие — завершить его нельзя</span>
    );
  }
  if (!event.data) return null;
  const seconds = Math.round((Date.parse(event.data.endsAt) - now.getTime()) / 1000);
  const finished = seconds <= 0;
  return (
    <>
      <button
        type="button"
        className="demo-button"
        disabled={finished || shift.isPending}
        onClick={() => shift.mutate(seconds + AFTER_END_SECONDS)}
      >
        Завершить это событие
      </button>
      {finished && <span className="demo-note">Мероприятие уже завершилось</span>}
    </>
  );
}

/**
 * Сброс с подтверждением. Кнопки сменяют друг друга, поэтому фокус переводится явно:
 * на «Отмена» при открытии подтверждения и обратно на «Сбросить демо-данные» после
 * отмены или сброса — иначе с клавиатуры он уходит в начало страницы.
 */
function ResetDemo() {
  const reset = useResetDemo();
  const [confirming, setConfirming] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const moved = useRef(false);

  useEffect(() => {
    if (!moved.current) return;
    (confirming ? cancel : opener).current?.focus();
  }, [confirming]);

  const toggle = (next: boolean) => {
    moved.current = true;
    setConfirming(next);
  };

  if (!confirming) {
    return (
      <button ref={opener} type="button" className="demo-button" onClick={() => toggle(true)}>
        Сбросить демо-данные
      </button>
    );
  }
  return (
    <span className="demo-confirm" role="group" aria-label="Подтверждение сброса">
      <span>Все изменения на стенде пропадут, войти нужно будет заново.</span>
      <button
        type="button"
        className="demo-button demo-button-danger"
        disabled={reset.isPending}
        onClick={() => reset.mutate(undefined, { onSuccess: () => toggle(false) })}
      >
        Да, сбросить
      </button>
      <button ref={cancel} type="button" className="demo-button" onClick={() => toggle(false)}>
        Отмена
      </button>
      {reset.isError && (
        <span className="demo-note" role="alert">
          Не удалось сбросить демо-данные: {reset.error.message}
        </span>
      )}
    </span>
  );
}

/**
 * Инструменты проверки (ТЗ 4.6): номер стенда, время последнего сброса,
 * перемотка времени и сброс демо-данных. Есть только при `DEMO_MODE=true`
 * и видна на всех экранах — в том числе на экране входа и в админке.
 * На мобильном свёрнута в одну строку: первый экран карточки события —
 * под содержимое (docs/design.md).
 */
export function DemoPanel() {
  const stand = useStandInfo();
  // Время стенда идёт само: часы сервера с демо-сдвигом (DECISION-002)
  const now = useClock();
  const shift = useShiftClock();
  const eventPage = useMatch('/events/:id');
  const [open, setOpen] = useState(false);
  const toolsId = useId();
  if (!stand.data?.demoMode) return null;
  const { standId, lastResetAt } = stand.data;

  return (
    <section className="demo-panel" aria-label="Демо-панель" data-open={open ? '' : undefined}>
      <div className="demo-bar">
        <span className="demo-summary">
          {`Демо · ${standId ?? 'стенд'} · ${timeFormat.format(now)}`}
        </span>
        <button
          type="button"
          className="demo-button demo-toggle"
          aria-expanded={open}
          aria-controls={toolsId}
          onClick={() => setOpen(!open)}
        >
          Инструменты
        </button>
      </div>
      <div className="demo-tools" id={toolsId}>
        <p className="demo-status">
          <span className="demo-tag">Демо</span>
          <span>{standId ? `Стенд ${standId}` : 'Демо-стенд'}</span>
          <span>
            {lastResetAt ? `Сброс: ${krasnoyarsk(new Date(lastResetAt))}` : 'Сброса ещё не было'}
          </span>
          <span>Время стенда: {krasnoyarsk(now)}</span>
        </p>
        <div className="demo-actions">
          <button
            type="button"
            className="demo-button"
            disabled={shift.isPending}
            onClick={() => shift.mutate(HOUR)}
          >
            +1 час
          </button>
          <button
            type="button"
            className="demo-button"
            disabled={shift.isPending}
            onClick={() => shift.mutate(DAY)}
          >
            +1 день
          </button>
          {eventPage?.params.id && (
            <FinishEvent eventId={eventPage.params.id} now={now} shift={shift} />
          )}
          <ResetDemo />
          <Link to="/check">Как проверить</Link>
        </div>
        {shift.isError && (
          <p className="demo-note" role="alert">
            Не удалось перевести часы: {shiftError(shift.error)}
          </p>
        )}
      </div>
    </section>
  );
}
