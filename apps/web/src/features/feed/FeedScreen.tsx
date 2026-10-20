import {
  EVENT_LEVELS,
  EVENT_LEVEL_TITLES,
  SPORT_CATEGORIES,
  SPORT_CATEGORY_TITLES,
} from '@tandem/domain';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent, Ref } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ApiRequestError } from '../../shared/api';
import { useClock } from '../../shared/clock';
import { coverAlt, coverUrl } from '../../shared/illustrations';
import { useTheme } from '../../shared/theme';
import { EmptyState, EventDate, Icon, ModeBadge } from '../../shared/ui';
import { useFeed } from './api';
import type { FeedItem } from './api';
import {
  FEED_DATES,
  FEED_DATE_TITLES,
  filterParams,
  hiddenFilterCount,
  readFilters,
} from './filters';
import type { FeedFilters } from './filters';
import { SportFilter } from './SportFilter';

const LEVEL_OPTIONS = EVENT_LEVELS.map((value) => ({ value, label: EVENT_LEVEL_TITLES[value] }));

/**
 * Карточка в ленте (ТЗ 2.11): не больше 5 элементов — обложка направления, название,
 * листок даты со временем, район и бейдж режима. Вся карточка — ссылка на событие.
 */
const errorText = (error: unknown) =>
  error instanceof ApiRequestError
    ? error.message
    : 'Не удалось загрузить ленту. Попробуйте ещё раз';

function FeedCard({
  item,
  now,
  linkRef,
}: {
  item: FeedItem;
  now: Date;
  linkRef?: Ref<HTMLAnchorElement>;
}) {
  const { contrast } = useTheme();
  return (
    <li className="feed-card">
      <Link className="feed-card-link" to={`/events/${item.id}`} ref={linkRef}>
        <img
          className="feed-card-cover"
          // Поля вписанного рисунка — фон группы; в «Контрасте» — фон темы: инверсия
          // контурной обложки перекрасила бы и фон
          style={contrast ? undefined : { background: `var(--cover-${item.sport.category})` }}
          src={coverUrl(item.sport.category, { contrast })}
          alt={coverAlt(item.sport.category)}
          width={320}
          height={180}
        />
        <div className="feed-card-body">
          <span className="feed-card-title">{item.title}</span>
          <EventDate
            startsAt={new Date(item.startsAt)}
            endsAt={new Date(item.endsAt)}
            now={now}
            compact
          />
          <div className="feed-card-meta">
            <span className="feed-card-area">{item.area}</span>
            <ModeBadge mode={item.mode} />
          </div>
        </div>
      </Link>
    </li>
  );
}

/** Строка поиска и фильтры: быстрые даты — на виду, остальное — в «Фильтрах». */
function FeedFiltersForm({
  filters,
  onChange,
}: {
  filters: FeedFilters;
  onChange(next: FeedFilters): void;
}) {
  const [query, setQuery] = useState(filters.q);
  const [city, setCity] = useState(filters.city);
  const [area, setArea] = useState(filters.area);

  // Адрес изменился снаружи («Назад» в браузере) — поля берут значения из него. Форма не
  // пересоздаётся: фокус, открытые «Фильтры» и набранный текст остаются на месте
  const [fromAddress, setFromAddress] = useState(filters);
  if (
    fromAddress.q !== filters.q ||
    fromAddress.city !== filters.city ||
    fromAddress.area !== filters.area
  ) {
    setFromAddress(filters);
    setQuery(filters.q);
    setCity(filters.city);
    setArea(filters.area);
  }

  // Любое изменение фильтра забирает и набранный, но ещё не применённый текст
  const apply = (patch: Partial<FeedFilters>) =>
    onChange({ ...filters, q: query, city, area, ...patch });
  const hidden = hiddenFilterCount(filters);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    apply({});
  };

  return (
    <form className="feed-filters" role="search" onSubmit={submit}>
      <div className="feed-search">
        <label className="visually-hidden" htmlFor="feed-q">
          Поиск по названию и направлению
        </label>
        <input
          id="feed-q"
          maxLength={100}
          type="search"
          placeholder="Бег, шахматы, падел…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button className="button button-primary" type="submit">
          Найти
        </button>
      </div>

      <fieldset className="feed-dates">
        <legend className="visually-hidden">Когда</legend>
        {[undefined, ...FEED_DATES].map((date) => (
          <label className="feed-chip" key={date ?? 'any'}>
            <input
              type="radio"
              name="date"
              checked={filters.date === date}
              onChange={() => apply({ date })}
            />
            {date ? FEED_DATE_TITLES[date] : 'Любой день'}
          </label>
        ))}
      </fieldset>

      <details className="feed-more">
        <summary>
          <Icon name="action-filter" />
          Фильтры{hidden > 0 && ` · ${hidden}`}
        </summary>
        <div className="feed-more-fields">
          <SportFilter value={filters.sport} onChange={(sport) => apply({ sport })} />
          <div className="field">
            <label htmlFor="feed-category">Группа направлений</label>
            <select
              id="feed-category"
              value={filters.category ?? ''}
              onChange={(event) =>
                apply({ category: SPORT_CATEGORIES.find((item) => item === event.target.value) })
              }
            >
              <option value="">Все группы</option>
              {SPORT_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {SPORT_CATEGORY_TITLES[category]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="feed-city">Город</label>
            <input
              id="feed-city"
              maxLength={80}
              value={city}
              onChange={(event) => setCity(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="feed-area">Район</label>
            <input
              id="feed-area"
              maxLength={120}
              value={area}
              onChange={(event) => setArea(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="feed-level">Уровень</label>
            <select
              id="feed-level"
              value={filters.level ?? ''}
              onChange={(event) =>
                apply({
                  level: LEVEL_OPTIONS.find((item) => item.value === event.target.value)?.value,
                })
              }
            >
              <option value="">Все уровни</option>
              {LEVEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="feed-mode">Запись</label>
            <select
              id="feed-mode"
              value={filters.mode ?? ''}
              onChange={(event) =>
                apply({
                  mode:
                    event.target.value === 'free' || event.target.value === 'approval'
                      ? event.target.value
                      : undefined,
                })
              }
            >
              <option value="">Любая</option>
              <option value="free">Свободно</option>
              <option value="approval">По заявке</option>
            </select>
          </div>
          <button className="button" type="submit">
            Применить
          </button>
        </div>
      </details>
    </form>
  );
}

/** Лента и поиск (ТЗ 2.8): опубликованные события по дате начала, фильтры складываются. */
export function FeedScreen() {
  const now = useClock();
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const feed = useFeed(filters);
  const items = feed.data?.pages.flatMap((page) => page.items) ?? [];
  const total = feed.data?.pages[0]?.total ?? 0;
  // После «Показать ещё» фокус — на первой новой карточке: кнопка могла исчезнуть, и
  // обход Tab иначе начался бы с начала страницы. Каждая догрузка — новый объект: после
  // смены фильтров индекс может совпасть с прежним, а эффект должен сработать снова
  const [focusRequest, setFocusRequest] = useState<{ index: number } | null>(null);
  const focusIndex = focusRequest?.index ?? null;
  const focusTarget = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (focusRequest) focusTarget.current?.focus();
  }, [focusRequest]);
  // «Повторить» после сбоя перечитывания уже загруженной ленты (например, после перемотки
  // демо-часов): ошибка ещё в состоянии, но запрос уже идёт. При первой загрузке без данных
  // запрос сам возвращается в «pending»
  const retrying = feed.isError && !feed.isFetchNextPageError && feed.isFetching;

  return (
    <div className="page">
      <h1>Найти занятие</h1>
      <FeedFiltersForm filters={filters} onChange={(next) => setParams(filterParams(next))} />

      {(feed.isPending || retrying) && <p role="status">Загрузка…</p>}
      {feed.isError && !feed.isFetchNextPageError && (
        <div className="feed-error">
          {!retrying && (
            <p className="form-error" role="alert">
              {errorText(feed.error)}
            </p>
          )}
          {/* aria-disabled, а не disabled: фокус остаётся на кнопке, если повтор снова не удался */}
          <button
            className="button"
            type="button"
            aria-disabled={retrying || undefined}
            onClick={() => {
              if (!retrying) void feed.refetch();
            }}
          >
            Повторить
          </button>
        </div>
      )}
      {feed.isSuccess && items.length === 0 && (
        <EmptyState
          text="Ничего не нашлось — попробуйте другие фильтры"
          action={{ label: 'Создайте своё событие', to: '/create' }}
        />
      )}
      {items.length > 0 && (
        <>
          <p className="feed-total" role="status">
            Найдено: {total}
          </p>
          <ul className="feed-list">
            {items.map((item, index) => (
              <FeedCard
                key={item.id}
                item={item}
                now={now}
                linkRef={index === focusIndex ? focusTarget : undefined}
              />
            ))}
          </ul>
        </>
      )}
      {feed.isFetchNextPageError && (
        <p className="form-error" role="alert">
          {errorText(feed.error)}
        </p>
      )}
      {feed.hasNextPage && (
        <button
          className="button feed-next"
          type="button"
          disabled={feed.isFetchingNextPage}
          onClick={() => {
            const first = items.length;
            void feed.fetchNextPage().then((result) => {
              if (!result.isError) setFocusRequest({ index: first });
            });
          }}
        >
          Показать ещё
        </button>
      )}
    </div>
  );
}
