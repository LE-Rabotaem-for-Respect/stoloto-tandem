import { SPORT_NAME_MAX_LENGTH } from '@tandem/domain';
import type { SportCategory } from '@tandem/domain';
import type { EventLevel } from '../../../shared/ui';

/** Шаги формы (ТЗ 2.11, «Бюджет экранов»): короткие экраны вместо одной длинной формы. */
export const STEPS = ['Что', 'Когда и где', 'Условия', 'Запись'] as const;
export type StepIndex = 0 | 1 | 2 | 3;

/** Направление: выбранное из подсказок или новое («Добавить «…» как новое»). */
export type SportChoice =
  | { kind: 'existing'; id: string; name: string; category: SportCategory }
  | { kind: 'new'; name: string; category?: SportCategory };

export interface CreateEventState {
  title: string;
  description: string;
  sport: SportChoice | null;
  /** Календарная дата «ГГГГ-ММ-ДД» и время «ЧЧ:ММ» — по Красноярску. */
  date: string;
  startTime: string;
  endTime: string;
  city: string;
  area: string;
  placeText: string;
  participantInfo: string;
  level: EventLevel | null;
  mode: 'free' | 'approval' | null;
  applyQuestion: string;
}

export const emptyState = (): CreateEventState => ({
  title: '',
  description: '',
  sport: null,
  date: '',
  startTime: '',
  endTime: '',
  city: 'Красноярск',
  area: '',
  placeText: '',
  participantInfo: '',
  level: null,
  mode: null,
  applyQuestion: '',
});

export type FieldErrors = Record<string, string>;

/** На каком шаге поле: ошибку сервера показываем там, где поле видно. */
const FIELD_STEPS: Record<string, StepIndex> = {
  title: 0,
  description: 0,
  sportId: 0,
  newSport: 0,
  'newSport.name': 0,
  'newSport.category': 0,
  startsAt: 1,
  endsAt: 1,
  city: 1,
  area: 1,
  placeText: 1,
  participantInfo: 2,
  level: 2,
  mode: 3,
  applyQuestion: 3,
};

/** Поле ответа api → поле формы (у нового направления ошибка имени — у поля направления). */
export function formField(apiField: string): string {
  if (apiField === 'sportId' || apiField.startsWith('newSport')) return 'sport';
  if (apiField === 'startsAt') return 'startTime';
  if (apiField === 'endsAt') return 'endTime';
  return apiField;
}

/** Первый шаг, на котором есть ошибка; `null` — ошибок полей нет. */
export function firstStepWithError(apiFields: FieldErrors): StepIndex | null {
  const steps = Object.keys(apiFields)
    .map((field) => FIELD_STEPS[field])
    .filter((step): step is StepIndex => step !== undefined);
  return steps.length > 0 ? (Math.min(...steps) as StepIndex) : null;
}

// Красноярск — UTC+7 круглый год (без перехода на летнее время с 2014 года)
const KRASNOYARSK_OFFSET = '+07:00';

/** Дата и время по Красноярску → момент времени; неполный ввод — `null`. */
export function krasnoyarskTime(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const moment = new Date(`${date}T${time}:00${KRASNOYARSK_OFFSET}`);
  return Number.isNaN(moment.getTime()) ? null : moment;
}

const length = (value: string) => value.trim().length;

/**
 * Проверки шага до отправки — те же правила, что у api (ТЗ 2.2), чтобы человек
 * увидел ошибку сразу у поля. Окончательно решает сервер.
 */
export function stepErrors(step: StepIndex, state: CreateEventState, now: Date): FieldErrors {
  const errors: FieldErrors = {};
  if (step === 0) {
    if (length(state.title) < 5 || length(state.title) > 80) {
      errors.title = 'Название — от 5 до 80 символов';
    }
    if (!state.sport) errors.sport = 'Выберите направление из списка или добавьте новое';
    else if (
      state.sport.kind === 'new' &&
      (length(state.sport.name) < 2 || length(state.sport.name) > SPORT_NAME_MAX_LENGTH)
    ) {
      errors.sport = `Название направления — от 2 до ${SPORT_NAME_MAX_LENGTH} символов`;
    }
    if (length(state.description) === 0) errors.description = 'Добавьте описание';
    else if (length(state.description) > 2000) {
      errors.description = 'Описание — не длиннее 2000 символов';
    }
  }
  if (step === 1) {
    const starts = krasnoyarskTime(state.date, state.startTime);
    const ends = krasnoyarskTime(state.date, state.endTime);
    if (!state.date) errors.date = 'Укажите дату';
    if (!starts) errors.startTime = 'Укажите время начала';
    else if (starts <= now) errors.startTime = 'Время начала должно быть в будущем';
    if (!ends) errors.endTime = 'Укажите время окончания';
    else if (starts && ends <= starts) errors.endTime = 'Окончание — позже начала';
    if (length(state.city) < 2 || length(state.city) > 80) {
      errors.city = 'Город — от 2 до 80 символов';
    }
    if (length(state.area) < 2 || length(state.area) > 120) {
      errors.area = 'Район или ориентир — от 2 до 120 символов';
    }
    if (length(state.placeText) < 3 || length(state.placeText) > 300) {
      errors.placeText = 'Адрес или описание места — от 3 до 300 символов';
    }
  }
  if (step === 2) {
    if (!state.level) errors.level = 'Выберите уровень';
    if (length(state.participantInfo) > 2000) {
      errors.participantInfo = 'Информация для участников — не длиннее 2000 символов';
    }
  }
  if (step === 3) {
    if (!state.mode) errors.mode = 'Выберите режим записи';
    if (state.mode === 'approval' && length(state.applyQuestion) > 300) {
      errors.applyQuestion = 'Вопрос к заявке — не длиннее 300 символов';
    }
  }
  return errors;
}

/** Тело `POST /events`: вопрос к заявке — только для режима «По заявке». */
export function toRequestBody(state: CreateEventState) {
  const starts = krasnoyarskTime(state.date, state.startTime);
  const ends = krasnoyarskTime(state.date, state.endTime);
  const sport = state.sport;
  return {
    title: state.title.trim(),
    description: state.description.trim(),
    ...(sport?.kind === 'existing' && { sportId: sport.id }),
    ...(sport?.kind === 'new' && {
      newSport: { name: sport.name.trim(), ...(sport.category && { category: sport.category }) },
    }),
    startsAt: starts?.toISOString(),
    endsAt: ends?.toISOString(),
    city: state.city.trim(),
    area: state.area.trim(),
    placeText: state.placeText.trim(),
    ...(state.participantInfo.trim() && { participantInfo: state.participantInfo.trim() }),
    mode: state.mode,
    ...(state.mode === 'approval' &&
      state.applyQuestion.trim() && { applyQuestion: state.applyQuestion.trim() }),
    level: state.level,
  };
}
