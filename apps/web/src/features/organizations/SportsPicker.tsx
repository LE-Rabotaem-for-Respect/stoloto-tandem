import { SPORT_CATEGORY_TITLES, SPORT_NAME_MAX_LENGTH } from '@tandem/domain';
import { useEffect, useId, useRef, useState } from 'react';
import type { OrganizationSport } from './api';
import { useSportSearch } from './api';

/** Предел API: у организации — не больше 20 направлений. */
export const MAX_SPORTS = 20;

interface SportsPickerProps {
  value: OrganizationSport[];
  onChange(sports: OrganizationSport[]): void;
  error?: string;
}

/** Направления организации: выбранные списком и поиск по каталогу, чтобы добавить ещё. */
export function SportsPicker({ value, onChange, error }: SportsPickerProps) {
  const id = useId();
  const [query, setQuery] = useState('');
  const search = useSportSearch(query);
  const chosen = new Set(value.map((sport) => sport.id));
  // При ошибке поиска прошлые результаты не показываются: они не про этот запрос
  const found =
    query.trim() && !search.isError
      ? (search.data?.items ?? []).filter((sport) => !chosen.has(sport.id))
      : [];
  const full = value.length >= MAX_SPORTS;
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // Нажатая кнопка пропадает из списка — фокус переходит на соседний пункт или в поиск
  const focusAfterChange = useRef<number | 'search' | null>(null);

  useEffect(() => {
    const target = focusAfterChange.current;
    focusAfterChange.current = null;
    if (target === null) return;
    const buttons = [...(listRef.current?.querySelectorAll('button') ?? [])];
    const search = searchRef.current;
    if (target === 'search' && search && !search.disabled) search.focus();
    else if (buttons.length > 0) {
      buttons[
        target === 'search' ? buttons.length - 1 : Math.min(target, buttons.length - 1)
      ]?.focus();
    } else search?.focus();
  }, [value]);

  const remove = (index: number) => {
    focusAfterChange.current = index;
    onChange(value.filter((_, position) => position !== index));
  };
  const add = (sport: OrganizationSport) => {
    focusAfterChange.current = 'search';
    onChange([...value, { id: sport.id, name: sport.name, category: sport.category }]);
    setQuery('');
  };

  return (
    <fieldset
      className="choice org-sports"
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
    >
      <legend>Направления</legend>
      {value.length === 0 ? (
        <p className="org-sports-empty">Пока не выбрано ни одного</p>
      ) : (
        <ul className="org-sports-list" ref={listRef}>
          {value.map((sport, index) => (
            <li key={sport.id} className="org-sport">
              <span>{sport.name}</span>
              <button
                className="button org-sport-remove"
                type="button"
                aria-label={`Убрать «${sport.name}»`}
                onClick={() => remove(index)}
              >
                Убрать
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="field">
        <label htmlFor={`${id}-search`}>Найти направление</label>
        <input
          id={`${id}-search`}
          ref={searchRef}
          type="search"
          value={query}
          maxLength={SPORT_NAME_MAX_LENGTH}
          disabled={full}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {full && <p>Выбрано {MAX_SPORTS} направлений — больше добавить нельзя</p>}
      {!full && query.trim() && search.isSuccess && found.length === 0 && (
        <p>Ничего не нашлось — попробуйте другое название</p>
      )}
      {!full && query.trim() && search.isError && (
        <p className="field-error" role="alert">
          {search.error.message}
        </p>
      )}
      {!full && found.length > 0 && (
        <ul className="org-sports-found" aria-label="Найденные направления">
          {found.map((sport) => (
            <li key={sport.id}>
              <button className="button choice-option" type="button" onClick={() => add(sport)}>
                Добавить «{sport.name}»
                <span className="org-sport-category">{SPORT_CATEGORY_TITLES[sport.category]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </fieldset>
  );
}
