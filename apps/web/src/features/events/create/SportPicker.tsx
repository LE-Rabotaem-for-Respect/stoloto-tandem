import { SPORT_CATEGORIES, SPORT_CATEGORY_TITLES, SPORT_NAME_MAX_LENGTH } from '@tandem/domain';
import type { SportCategory } from '@tandem/domain';
import { useId, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useSportSuggestions } from '../api';
import type { SportChoice } from './form-state';

interface Option {
  key: string;
  label: string;
  choose(): SportChoice;
}

interface SportPickerProps {
  value: SportChoice | null;
  onChange(value: SportChoice | null): void;
  error?: string;
}

/**
 * Направление с автодополнением (ТЗ 2.3). Если в каталоге совпадения нет —
 * пункт «Добавить «…» как новое направление» и необязательный выбор группы.
 * Список — по шаблону combobox: стрелки, Enter, Escape.
 */
export function SportPicker({ value, onChange, error }: SportPickerProps) {
  const id = useId();
  const [text, setText] = useState(value?.name ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const suggestions = useSportSuggestions(open ? text : '');

  const query = text.trim();
  const items = suggestions.data?.items ?? [];
  const options: Option[] = items.map((sport) => ({
    key: sport.id,
    label: sport.name,
    choose: () => ({ kind: 'existing', id: sport.id, name: sport.name, category: sport.category }),
  }));
  if (suggestions.data && !suggestions.data.exactMatch && query.length >= 2) {
    options.push({
      key: 'new',
      label: `Добавить «${query}» как новое направление`,
      choose: () => ({ kind: 'new', name: query }),
    });
  }
  const listOpen = open && query.length > 0 && options.length > 0;

  const choose = (option: Option) => {
    const choice = option.choose();
    onChange(choice);
    setText(choice.name);
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Закрытый список стрелка вниз открывает снова (шаблон combobox)
    if (!listOpen) {
      if (event.key === 'ArrowDown' && query.length > 0) {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => (index + 1) % options.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => (index - 1 + options.length) % options.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = options[active];
      if (option) choose(option);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const listId = `${id}-list`;
  const errorId = `${id}-error`;
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
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        autoComplete="off"
        maxLength={SPORT_NAME_MAX_LENGTH}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setActive(0);
          setOpen(true);
          onChange(null);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      />
      {listOpen && (
        <ul className="sport-options" id={listId} role="listbox" aria-label="Подсказки">
          {options.map((option, index) => (
            <li
              key={option.key}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              className={option.key === 'new' ? 'sport-option sport-option-new' : 'sport-option'}
              // mousedown, а не click: иначе поле теряет фокус и список закрывается раньше
              onMouseDown={(event) => {
                event.preventDefault();
                choose(option);
              }}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
      {suggestions.isError && open && (
        <p className="field-error" role="status">
          Не удалось загрузить подсказки — попробуйте ещё раз
        </p>
      )}
      {error && (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      )}
      {value?.kind === 'new' && (
        <div className="field">
          <label htmlFor={`${id}-category`}>Группа нового направления (необязательно)</label>
          <select
            id={`${id}-category`}
            value={value.category ?? ''}
            onChange={(event) =>
              onChange({
                ...value,
                category: (event.target.value || undefined) as SportCategory | undefined,
              })
            }
          >
            <option value="">Другое — по умолчанию</option>
            {SPORT_CATEGORIES.filter((category) => category !== 'other').map((category) => (
              <option key={category} value={category}>
                {SPORT_CATEGORY_TITLES[category]}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
