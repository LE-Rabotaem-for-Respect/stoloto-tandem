import { EVENT_LEVELS, EVENT_LEVEL_TITLES } from '@tandem/domain';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactNode, TextareaHTMLAttributes } from 'react';
import { useNavigate } from 'react-router';
import { ApiRequestError } from '../../../shared/api';
import { useClock } from '../../../shared/clock';
import { Field, PrimaryButton, Stepper } from '../../../shared/ui';
import type { Step } from '../../../shared/ui';
import { useCreateEvent } from '../api';
import { EventPreview } from './EventPreview';
import {
  STEPS,
  emptyState,
  firstStepWithError,
  formField,
  stepErrors,
  stepOfField,
  toRequestBody,
} from './form-state';
import type { CreateEventState, FieldErrors, StepIndex } from './form-state';
import { SportPicker } from './SportPicker';

const LEVEL_OPTIONS = EVENT_LEVELS.map((value) => ({ value, label: EVENT_LEVEL_TITLES[value] }));

const LAST_STEP = (STEPS.length - 1) as StepIndex;

function TextArea({
  label,
  error,
  ...textarea
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string }) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        rows={4}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...textarea}
      />
      {error && (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}

function Choice({
  legend,
  error,
  children,
}: {
  legend: string;
  error?: string;
  children: ReactNode;
}) {
  const errorId = useId();
  return (
    <fieldset
      className="choice"
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
    >
      <legend>{legend}</legend>
      {children}
      {error && (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Есть ли на шаге ошибки — найденные проверкой шага или пришедшие от сервера. */
const stepHasErrors = (step: StepIndex, errors: FieldErrors) =>
  Object.keys(errors).some((field) => stepOfField(field) === step);

/** Ошибки других шагов остаются: проверка шага заменяет только свои. */
const replaceStepErrors = (errors: FieldErrors, step: StepIndex, found: FieldErrors) => ({
  ...Object.fromEntries(Object.entries(errors).filter(([field]) => stepOfField(field) !== step)),
  ...found,
});

// Необязательные поля в «Дополнительно»
type OptionalField = 'participantInfo' | 'applyQuestion';

/**
 * Создание мероприятия (ТЗ 2.2, 2.11): четыре коротких шага со степпером,
 * необязательное — в «Дополнительно», на последнем шаге — предпросмотр карточки.
 * Проверки шагов повторяют серверные; окончательно решает api.
 */
export function CreateEventForm() {
  const now = useClock();
  const navigate = useNavigate();
  const create = useCreateEvent();
  const [state, setState] = useState<CreateEventState>(emptyState);
  const [step, setStep] = useState<StepIndex>(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string>();
  // Счётчик «перевести фокус на сообщение»: кнопка на время запроса отключена, и без этого
  // фокус после отказа без полей (403, нет связи) уходил бы на body
  const [focusMessage, setFocusMessage] = useState(0);
  const messageRef = useRef<HTMLParagraphElement>(null);
  // Открытость «Дополнительно» — своим состоянием: исправление поля не сворачивает блок
  const [moreOpen, setMoreOpen] = useState<Record<OptionalField, boolean>>({
    participantInfo: false,
    applyQuestion: false,
  });
  // Счётчик запросов «перевести фокус на первое поле с ошибкой»
  const [focusInvalid, setFocusInvalid] = useState(0);
  const form = useRef<HTMLFormElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Новый шаг — фокус на его заголовок: клавиатура и экранный диктор начинают сверху
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    heading.current?.focus();
  }, [step]);

  // Шаг не прошёл проверку — фокус на первое поле с ошибкой (после фокуса на заголовок)
  useEffect(() => {
    if (focusInvalid === 0) return;
    const invalid = form.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    const target =
      invalid instanceof HTMLFieldSetElement
        ? invalid.querySelector<HTMLElement>('input')
        : invalid;
    target?.focus();
  }, [focusInvalid]);

  useEffect(() => {
    if (focusMessage > 0) messageRef.current?.focus();
  }, [focusMessage]);

  const showErrors = (next: FieldErrors) => {
    setErrors(next);
    setMoreOpen((current) => ({
      participantInfo: current.participantInfo || Boolean(next.participantInfo),
      applyQuestion: current.applyQuestion || Boolean(next.applyQuestion),
    }));
    setFocusInvalid((count) => count + 1);
  };

  const set = (patch: Partial<CreateEventState>) => {
    setState((current) => ({ ...current, ...patch }));
    // Исправленное поле больше не подсвечиваем
    const fixed = new Set(Object.keys(patch));
    // Время проверяется вместе с датой
    if (fixed.has('date')) ['startTime', 'endTime'].forEach((field) => fixed.add(field));
    setErrors((current) =>
      Object.fromEntries(Object.entries(current).filter(([field]) => !fixed.has(field))),
    );
  };

  const goTo = (target: StepIndex) => {
    setMessage(undefined);
    setStep(target);
  };

  const next = () => {
    const found = stepErrors(step, state, now);
    if (Object.keys(found).length > 0) {
      showErrors(replaceStepErrors(errors, step, found));
      return;
    }
    setErrors(replaceStepErrors(errors, step, {}));
    goTo((step + 1) as StepIndex);
  };

  const publish = () => {
    // Все шаги — заново: пока человек заполнял форму, время начала могло пройти
    for (const index of [0, 1, 2, 3] as StepIndex[]) {
      const found = stepErrors(index, state, now);
      if (Object.keys(found).length > 0) {
        showErrors(replaceStepErrors(errors, index, found));
        goTo(index);
        return;
      }
    }
    setMessage(undefined);
    create.mutate(toRequestBody(state), {
      onSuccess: (event) => void navigate(`/events/${event.id}`),
      onError: (error) => {
        if (!(error instanceof ApiRequestError)) {
          setMessage('Не удалось опубликовать. Проверьте связь и попробуйте ещё раз');
          setFocusMessage((count) => count + 1);
          return;
        }
        const target = firstStepWithError(error.fields);
        if (target === null) {
          setMessage(error.message);
          setFocusMessage((count) => count + 1);
          return;
        }
        const fields: FieldErrors = {};
        for (const [field, text] of Object.entries(error.fields)) fields[formField(field)] = text;
        showErrors(fields);
        setStep(target);
        setMessage('Сервер не принял часть полей — исправьте отмеченное');
      },
    });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (step === LAST_STEP) publish();
    else next();
  };

  const steps: Step[] = STEPS.map((label, index) => {
    const at = index as StepIndex;
    if (at === step) return { label, state: 'current', icon: 'action-create' };
    if (stepHasErrors(at, errors)) return { label, state: 'error' };
    return { label, state: at < step ? 'done' : 'upcoming' };
  });

  return (
    <form ref={form} className="form create-event" onSubmit={submit} noValidate>
      <Stepper steps={steps} label="Шаги создания мероприятия" />
      <h2 ref={heading} tabIndex={-1} className="create-event-step">
        Шаг {step + 1} из {STEPS.length}: {STEPS[step]}
      </h2>

      {step === 0 && (
        <>
          <Field
            label="Название"
            value={state.title}
            onChange={(event) => set({ title: event.target.value })}
            error={errors.title}
          />
          <SportPicker
            value={state.sport}
            onChange={(sport) => set({ sport })}
            error={errors.sport}
          />
          <TextArea
            label="Описание"
            value={state.description}
            onChange={(event) => set({ description: event.target.value })}
            error={errors.description}
          />
        </>
      )}

      {step === 1 && (
        <>
          <Field
            label="Дата"
            type="date"
            value={state.date}
            onChange={(event) => set({ date: event.target.value })}
            error={errors.date}
          />
          <div className="create-event-times">
            <Field
              label="Начало"
              type="time"
              value={state.startTime}
              onChange={(event) => set({ startTime: event.target.value })}
              error={errors.startTime}
            />
            <Field
              label="Окончание"
              type="time"
              value={state.endTime}
              onChange={(event) => set({ endTime: event.target.value })}
              error={errors.endTime}
            />
          </div>
          <Field
            label="Город"
            value={state.city}
            onChange={(event) => set({ city: event.target.value })}
            error={errors.city}
          />
          <Field
            label="Район или ориентир"
            value={state.area}
            onChange={(event) => set({ area: event.target.value })}
            error={errors.area}
          />
          <Field
            label="Адрес или как найти место"
            value={state.placeText}
            onChange={(event) => set({ placeText: event.target.value })}
            error={errors.placeText}
          />
        </>
      )}

      {step === 2 && (
        <>
          <Choice legend="Уровень участников" error={errors.level}>
            {LEVEL_OPTIONS.map((option) => (
              <label className="choice-option" key={option.value}>
                <input
                  type="radio"
                  name="level"
                  checked={state.level === option.value}
                  onChange={() => set({ level: option.value })}
                />
                {option.label}
              </label>
            ))}
          </Choice>
          <details
            className="create-event-more"
            open={moreOpen.participantInfo}
            onToggle={(event) => {
              const open = event.currentTarget.open;
              setMoreOpen((current) => ({ ...current, participantInfo: open }));
            }}
          >
            <summary>Дополнительно</summary>
            <TextArea
              label="Информация для участников (видна только записанным)"
              value={state.participantInfo}
              onChange={(event) => set({ participantInfo: event.target.value })}
              error={errors.participantInfo}
            />
          </details>
        </>
      )}

      {step === 3 && (
        <>
          <Choice legend="Как записываться" error={errors.mode}>
            <label className="choice-option">
              <input
                type="radio"
                name="mode"
                checked={state.mode === 'free'}
                onChange={() => set({ mode: 'free' })}
              />
              Свободно — участник записывается сразу
            </label>
            <label className="choice-option">
              <input
                type="radio"
                name="mode"
                checked={state.mode === 'approval'}
                onChange={() => set({ mode: 'approval' })}
              />
              По заявке — вы подтверждаете каждого
            </label>
          </Choice>
          {state.mode === 'approval' && (
            <details
              className="create-event-more"
              open={moreOpen.applyQuestion}
              onToggle={(event) => {
                const open = event.currentTarget.open;
                setMoreOpen((current) => ({ ...current, applyQuestion: open }));
              }}
            >
              <summary>Дополнительно</summary>
              <TextArea
                label="Вопрос к заявке"
                value={state.applyQuestion}
                rows={2}
                onChange={(event) => set({ applyQuestion: event.target.value })}
                error={errors.applyQuestion}
              />
            </details>
          )}
          <section className="create-event-preview" aria-labelledby="preview-title">
            <h3 id="preview-title">Так увидят участники</h3>
            <EventPreview state={state} now={now} />
          </section>
        </>
      )}

      {message && (
        <p className="form-error" role="alert" tabIndex={-1} ref={messageRef}>
          {message}
        </p>
      )}

      <div className="create-event-nav">
        {step > 0 && (
          <button className="button" type="button" onClick={() => goTo((step - 1) as StepIndex)}>
            Назад
          </button>
        )}
        {step < LAST_STEP ? (
          <button className="button button-primary" type="submit">
            Далее
          </button>
        ) : (
          <PrimaryButton type="submit" disabled={create.isPending}>
            {create.isPending ? 'Публикуем…' : 'Опубликовать'}
          </PrimaryButton>
        )}
      </div>
    </form>
  );
}
