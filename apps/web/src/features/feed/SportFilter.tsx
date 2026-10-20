import { SPORT_NAME_MAX_LENGTH } from '@tandem/domain';
import { useId, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useSportSuggestions } from '../events/api';
import type { FeedSport } from './filters';

interface SportFilterProps {
  value?: FeedSport;
  onChange(value: FeedSport | undefined): void;
}

/**
 * Фильтр по конкретному направлению (ТЗ 2.8), в том числе новому пользовательскому:
 * подсказки из каталога по шаблону combobox — стрелки, Enter, Escape. Пустое поле
 * снимает фильтр; набранный, но не выбранный текст фильтром не становится.
 */
export function SportFilter({ value, onChange }: SportFilterProps) {
  const id = useId();
  const [text, setText] = useState(value?.name ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Те же подсказки, что при создании события: скрытых направлений в них нет
  const options = useSportSuggestions(open ? text : '');

  // Фильтр сменился снаружи («Назад» в браузере) — поле показывает его название
  const [shown, setShown] = useState(value);
  if (shown?.id !== value?.id) {
    setShown(value);
    setText(value?.name ?? '');
  }

  const items = options.data?.items ?? [];
  const listOpen = open && text.trim().length > 0 && items.length > 0;

  const choose = (sport: FeedSport) => {
    setText(sport.name);
    setOpen(false);
    onChange({ id: sport.id, name: sport.name });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!listOpen) {
      if (event.key === 'ArrowDown' && text.trim().length > 0) {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => (index + 1) % items.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => (index - 1 + items.length) % items.length);
    } else if (event.key === 'Enter') {
      // Enter выбирает подсказку, а не отправляет форму фильтров
      event.preventDefault();
      const sport = items[active];
      if (sport) choose(sport);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-option-${index}`;

  return (
    <div className="field sport-picker">
      <label htmlFor={id}>Направление</label>
      <input
        id={id}
        role="combobox"
        aria-expanded={listOpen}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={listOpen ? optionId(active) : undefined}
        autoComplete="off"
        maxLength={SPORT_NAME_MAX_LENGTH}
        // Ссылка без названия направления: фильтр действует, поле не должно казаться пустым
        placeholder={value ? 'Выбрано направление' : 'Все направления'}
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          setActive(0);
          setOpen(true);
          if (next.trim() === '' && value) onChange(undefined);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          setOpen(false);
          // Не выбранный из подсказок текст не остаётся в поле: фильтр — прежний
          setText(value?.name ?? '');
        }}
      />
      {listOpen && (
        <ul className="sport-options" id={listId} role="listbox" aria-label="Подсказки">
          {items.map((sport, index) => (
            <li
              key={sport.id}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              className="sport-option"
              // mousedown, а не click: иначе поле теряет фокус и список закрывается раньше
              onMouseDown={(event) => {
                event.preventDefault();
                choose(sport);
              }}
            >
              {sport.name}
            </li>
          ))}
        </ul>
      )}
      {options.isError && open && (
        <p className="field-error" role="status">
          Не удалось загрузить подсказки — попробуйте ещё раз
        </p>
      )}
    </div>
  );
}
