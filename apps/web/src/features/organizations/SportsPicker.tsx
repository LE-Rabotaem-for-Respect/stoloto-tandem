import { SPORT_CATEGORY_TITLES } from '@tandem/domain';
import { useId, useState } from 'react';
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
  const found = query.trim()
    ? (search.data?.items ?? []).filter((sport) => !chosen.has(sport.id))
    : [];
  const full = value.length >= MAX_SPORTS;

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
        <ul className="org-sports-list">
          {value.map((sport) => (
            <li key={sport.id} className="org-sport">
              <span>{sport.name}</span>
              <button
                className="button org-sport-remove"
                type="button"
                aria-label={`Убрать «${sport.name}»`}
                onClick={() => onChange(value.filter((item) => item.id !== sport.id))}
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
          type="search"
          value={query}
          maxLength={60}
          disabled={full}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {full && <p>Выбрано {MAX_SPORTS} направлений — больше добавить нельзя</p>}
      {!full && query.trim() && search.isSuccess && found.length === 0 && (
        <p>Ничего не нашлось — попробуйте другое название</p>
      )}
      {!full && found.length > 0 && (
        <ul className="org-sports-found" aria-label="Найденные направления">
          {found.map((sport) => (
            <li key={sport.id}>
              <button
                className="button choice-option"
                type="button"
                onClick={() => {
                  onChange([
                    ...value,
                    { id: sport.id, name: sport.name, category: sport.category },
                  ]);
                  setQuery('');
                }}
              >
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
