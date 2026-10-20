import type { IconName } from '../illustrations';
import { dayMonth } from './dates';
import { DateLeaf } from './graphics';
import { Icon } from './Icon';

/** Сколько кружков мест рисуется рядом; при большем лимите — полоса заполнения. */
const MAX_DOTS = 20;
/** Сколько фигурок в очереди помещается в ряд на 360 px. */
const MAX_PEOPLE = 10;

interface SeatsProps {
  /** Лимит мест; `null` — без ограничения. */
  capacity: number | null;
  /** Сколько мест занято подтверждёнными участниками. */
  taken: number;
}

/** Места (docs/design.md, «Места»): кружки или полоса и подпись «Осталось 3 из 10». */
export function Seats({ capacity, taken }: SeatsProps) {
  if (capacity === null) {
    return (
      <div className="seats">
        <span className="seats-label">Без ограничения мест</span>
      </div>
    );
  }
  const occupied = Math.min(Math.max(taken, 0), capacity);
  const left = capacity - occupied;
  return (
    <div className={left === 0 ? 'seats seats--full' : 'seats'}>
      {capacity <= MAX_DOTS ? (
        <span className="seats-dots" aria-hidden="true">
          {Array.from({ length: capacity }, (_, index) => (
            <i key={index} data-taken={index < occupied ? '' : undefined} />
          ))}
        </span>
      ) : (
        <span className="seats-bar" aria-hidden="true">
          <span
            className="seats-bar-fill"
            style={{ width: `${Math.round((occupied / capacity) * 100)}%` }}
          />
        </span>
      )}
      <span className="seats-label">
        {left === 0 ? 'Мест нет' : `Осталось ${left} из ${capacity}`}
      </span>
    </div>
  );
}

/** Какие фигурки показать: первые в очереди и, если её не видно, своя — последней. */
function visibleQueue(size: number, position: number | undefined): number[] {
  if (size <= MAX_PEOPLE) return Array.from({ length: size }, (_, index) => index + 1);
  const head = Array.from({ length: MAX_PEOPLE }, (_, index) => index + 1);
  if (position === undefined || position <= MAX_PEOPLE) return head;
  return [...head.slice(0, MAX_PEOPLE - 1), position];
}

interface WaitlistQueueProps {
  /** Сколько человек в листе ожидания. */
  size: number;
  /** Позиция пользователя, если он в очереди. */
  position?: number;
}

/** Лист ожидания (P1): ряд фигурок, своя позиция залита тоном очереди и подписана. */
export function WaitlistQueue({ size, position: given }: WaitlistQueueProps) {
  if (size < 1) return null;
  // Позиция вне очереди — ошибка данных: не подсвечиваем ничью фигурку
  const position = given !== undefined && given >= 1 && given <= size ? given : undefined;
  const people = visibleQueue(size, position);
  return (
    <div className="queue">
      <span className="queue-people" aria-hidden="true">
        {people.map((place, index) => (
          <i
            key={place}
            data-me={place === position ? '' : undefined}
            data-gap={index > 0 && place - (people[index - 1] ?? 0) > 1 ? '' : undefined}
          />
        ))}
      </span>
      <span className="queue-label">
        {position === undefined
          ? `В листе ожидания: ${size}`
          : `Вы — ${position}-й в листе ожидания из ${size}`}
      </span>
    </div>
  );
}

export function FirstTimeBadge() {
  return (
    <span className="condition-badge">
      <Icon name="action-first-time" />
      Можно впервые
    </span>
  );
}

const rubles = new Intl.NumberFormat('ru-RU');

/** Стоимость (ТЗ 3.1): платежей на платформе нет, поэтому сумма — «оплата на месте». */
export function PriceBadge({ price }: { price: number }) {
  return (
    <span className="condition-badge">
      <Icon name="action-price" />
      {price === 0 ? (
        'Бесплатно'
      ) : (
        <>
          {`${rubles.format(price)} ₽ `}
          <span className="condition-note">оплата на месте</span>
        </>
      )}
    </span>
  );
}

interface BringWords {
  icon: IconName;
  /** Слово целиком, в любой из перечисленных форм: «форма» — но не «Формат». */
  forms?: readonly string[];
  /** Начало слова: «кроссовки», «кроссовках», «кедами». */
  stems?: readonly string[];
}

const BRING_ITEMS: readonly BringWords[] = [
  {
    icon: 'action-uniform',
    forms: ['форма', 'форму', 'формы', 'форме', 'формой'],
    stems: ['футболк'],
  },
  // «вода» — формами: с «вод» начинаются и «водолазка», и «водительские»
  {
    icon: 'action-water',
    forms: ['вода', 'воды', 'воду', 'воде', 'водой'],
    stems: ['водичк', 'бутыл'],
  },
  { icon: 'action-mat', stems: ['коврик'] },
  { icon: 'action-racket', stems: ['ракетк'] },
  { icon: 'action-shoes', stems: ['обув', 'кроссовк', 'кед', 'бутс'] },
];

/** Пиктограмма частого предмета «Что взять с собой» или `null` — тогда только текст. */
export function bringItem(text: string): IconName | null {
  const words = text
    .toLowerCase()
    .replaceAll('ё', 'е')
    .split(/[^а-яa-z]+/);
  const item = BRING_ITEMS.find(({ forms = [], stems = [] }) =>
    words.some((word) => forms.includes(word) || stems.some((stem) => word.startsWith(stem))),
  );
  return item?.icon ?? null;
}

/** «Что взять с собой»: частые предметы — пиктограммой с подписью, остальные — текстом. */
export function BringList({ items }: { items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="bring-list" aria-label="Что взять с собой">
      {items.map((text, index) => {
        const icon = bringItem(text);
        return (
          <li key={index} className={icon ? 'bring-item' : 'bring-item bring-item-text'}>
            {icon && <Icon name={icon} />}
            {text}
          </li>
        );
      })}
    </ul>
  );
}

const MAX_STEPS = 4;
// Конец предложения — точка, «!» или «?», пробел и заглавная буква или цифра, но не
// после сокращения адреса («ул. Ленина, д. 5»); «18.50» без пробела не режется
const SENTENCE_END =
  /(?<=[.!?])(?<!(?:^|[^\p{L}])(?:ул|пр|пер|пл|наб|бул|ш|д|корп|стр|г|им|см|т\.\s?е|т\.\s?к)\.)\s+(?=[\p{Lu}\d«"])/u;
// Маркер списка — только с пробелом после: «18.50 — сбор» и «-1 градус» — не маркеры
const LIST_MARKER = /^\s*(?:[-*•–—]|\d{1,2}[.)])\s+/;

// Одна строка — по предложениям, а если предложение одно — по «;»
function splitLine(line: string): string[] {
  const parts = (separator: RegExp | string) =>
    line
      .split(separator)
      .map((part) => part.trim())
      .filter(Boolean);
  const sentences = parts(SENTENCE_END);
  return sentences.length > 1 ? sentences : parts(';');
}

/**
 * Шаги «Как всё пройдёт» из свободного текста организатора: по строкам, а если строка
 * одна — по предложениям. Шагов не больше четырёх (ТЗ 2.11), лишние — в последнем.
 */
export function howItGoesSteps(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(LIST_MARKER, '').trim())
    .filter(Boolean);
  const steps = lines.length === 1 ? splitLine(lines[0] ?? '') : lines;
  if (steps.length <= MAX_STEPS) return steps;
  return [...steps.slice(0, MAX_STEPS - 1), steps.slice(MAX_STEPS - 1).join(' ')];
}

/** Таймлайн встречи «Как всё пройдёт»: сбор — разминка — занятие — после. */
export function HowItGoes({ text }: { text: string }) {
  const steps = howItGoesSteps(text);
  if (steps.length === 0) return null;
  return (
    <ol className="timeline" aria-label="Как всё пройдёт">
      {steps.map((step, index) => (
        <li key={index} className="timeline-step">
          {step}
        </li>
      ))}
    </ol>
  );
}

/** Листок переноса (P1): старый листок перечёркнут и приглушён, стрелка, новый. */
export function RescheduleLeaf({ from, to }: { from: Date; to: Date }) {
  return (
    <div className="reschedule">
      {/* Две даты подряд чтец прочёл бы как равноправные — смысл несёт подпись */}
      <span className="reschedule-leaves" aria-hidden="true">
        <DateLeaf date={from} compact off />
        <span className="reschedule-arrow" aria-hidden="true">
          →
        </span>
        <DateLeaf date={to} compact />
      </span>
      <span className="reschedule-label">{`Перенесено с ${dayMonth(from)} на ${dayMonth(to)}`}</span>
    </div>
  );
}
