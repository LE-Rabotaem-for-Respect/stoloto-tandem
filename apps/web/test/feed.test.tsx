import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, AppRoutes, createQueryClient } from '../src/App';
import {
  feedQuery,
  filterParams,
  hiddenFilterCount,
  readFilters,
} from '../src/features/feed/filters';

const CURLING = { id: '3f0c2a8e-5b1d-4c7e-9a20-6d8e1f4b7c31', name: 'Кёрлинг на льду' };
const SPORTS = [
  CURLING,
  { id: '9b7e4d12-0c3a-4f56-8e19-2a5d7c6b8f40', name: 'Кёрлинг' },
  { id: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f', name: 'Бег' },
];

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const item = (n: number) => ({
  id: `e${n}`,
  title: n === 1 ? 'Пробежка 5 км на Татышеве' : `Событие ${n}`,
  sport: { id: 's1', name: 'Бег', category: 'endurance', isCustom: false },
  organizer: { kind: 'organization', id: 'o1', name: 'Беговой клуб «Енисей»' },
  startsAt: '2026-10-21T00:30:00.000Z',
  endsAt: '2026-10-21T01:30:00.000Z',
  city: 'Красноярск',
  area: 'Остров Татышев',
  mode: n === 1 ? 'free' : 'approval',
  level: 'amateur',
  displayStatus: 'open',
});

/** Api в памяти: лента из `total` событий страницами, гость. */
function fakeApi(
  total = 1,
  fail: (offset: number, attempt: number) => boolean = () => false,
  /** Ответ ждёт, пока не выполнится этот промис, — чтобы застать запрос в пути. */
  wait: (attempt: number) => Promise<void> | undefined = () => undefined,
) {
  let attempt = 0;
  const feedRequests: URLSearchParams[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const { pathname, searchParams } = new URL(url, 'http://stand');
      if (pathname === '/api/me') return json(401, { code: 'unauthorized', message: 'Войдите' });
      if (pathname === '/api/clock') {
        return json(200, {
          now: '2026-10-19T12:00:00Z',
          demoMode: false,
          standId: null,
          lastResetAt: null,
        });
      }
      if (pathname === '/api/sports') {
        const q = (searchParams.get('q') ?? '').toLowerCase();
        const items = SPORTS.filter((sport) => sport.name.toLowerCase().includes(q)).map(
          (sport) => ({ ...sport, category: 'other', isCustom: true }),
        );
        return json(200, { items, exactMatch: false });
      }
      if (pathname === '/api/events') {
        feedRequests.push(searchParams);
        const limit = Number(searchParams.get('limit'));
        const offset = Number(searchParams.get('offset'));
        attempt += 1;
        await wait(attempt);
        if (fail(offset, attempt)) {
          return json(500, {
            code: 'internal',
            message: 'Что-то пошло не так. Попробуйте ещё раз',
          });
        }
        const count = Math.max(0, Math.min(limit, total - offset));
        const items = Array.from({ length: count }, (_, index) => item(offset + index + 1));
        return json(200, { items, total, limit, offset });
      }
      return json(404, { code: 'not_found', message: 'Не найдено' });
    }),
  );
  const last = () => feedRequests.at(-1);
  return { feedRequests, last };
}

function renderFeed(path = '/') {
  return render(
    <AppProviders client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('фильтры ленты в адресе', () => {
  it('неизвестные значения отбрасываются, а не уходят в api', () => {
    const filters = readFilters(
      new URLSearchParams('q=бег&date=someday&level=pro&mode=free&category=winter'),
    );
    expect(filters).toEqual({
      q: 'бег',
      category: 'winter',
      date: undefined,
      city: '',
      area: '',
      level: undefined,
      mode: 'free',
    });
  });

  it('длинные значения из адреса обрезаются до длины api', () => {
    const filters = readFilters(
      new URLSearchParams({ q: 'б'.repeat(120), city: 'к'.repeat(90), area: 'р'.repeat(130) }),
    );
    expect([filters.q.length, filters.city.length, filters.area.length]).toEqual([100, 80, 120]);
  });

  it('пустые и пробельные фильтры в адрес не пишутся', () => {
    const params = filterParams({ q: '  ', city: ' Красноярск ', area: '', date: 'weekend' });
    expect(params.toString()).toBe(
      new URLSearchParams({ date: 'weekend', city: 'Красноярск' }).toString(),
    );
  });

  it('направление — id в api, название только в адресе; чужое id отбрасывается', () => {
    const filters = readFilters(
      new URLSearchParams({ sport: CURLING.id, sportName: CURLING.name, q: 'лёд' }),
    );
    expect(filters.sport).toEqual(CURLING);
    expect(filterParams(filters).get('sportName')).toBe(CURLING.name);
    expect(feedQuery(filters).get('sport')).toBe(CURLING.id);
    expect(feedQuery(filters).has('sportName')).toBe(false);
    expect(hiddenFilterCount(filters)).toBe(1);

    for (const sport of [
      'curling',
      '1; DROP',
      `${CURLING.id}x`,
      // Hex в форме UUID, но без версии и варианта: api ответил бы 400
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
    ]) {
      expect(readFilters(new URLSearchParams({ sport, sportName: 'x' })).sport).toBeUndefined();
    }
    const long = readFilters(new URLSearchParams({ sport: CURLING.id, sportName: 'к'.repeat(80) }));
    expect(long.sport?.name).toHaveLength(50);
  });

  it('число на «Фильтрах» — только свёрнутые фильтры', () => {
    expect(hiddenFilterCount({ q: 'бег', city: '', area: '', date: 'today' })).toBe(0);
    expect(
      hiddenFilterCount({ q: '', city: 'Красноярск', area: ' ', level: 'beginner', mode: 'free' }),
    ).toBe(3);
  });
});

describe('лента и поиск', { timeout: 15_000 }, () => {
  it('карточка в ленте — обложка, название, дата со временем, район, режим; ведёт в карточку', async () => {
    const { last } = fakeApi();
    renderFeed();

    const link = await screen.findByRole('link', { name: /Пробежка 5 км на Татышеве/ });
    expect(link.getAttribute('href')).toBe('/events/e1');
    const card = within(link);
    expect(link.querySelector('img.feed-card-cover')).not.toBeNull();
    // Листок даты: число, месяц и день недели для чтецов, время рядом
    card.getByText('Среда, 21 октября');
    expect(link.querySelector('.date-leaf')).not.toBeNull();
    card.getByText('07:30–08:30');
    card.getByText('Остров Татышев');
    card.getByText('Свободно');
    // Не больше 5 элементов: ни организатора, ни уровня, ни статуса
    expect(link.textContent).not.toContain('Енисей');
    expect(link.textContent).not.toContain('Любитель');
    expect(link.textContent).not.toContain('Набор открыт');
    expect(last()?.get('limit')).toBe('20');
    expect(last()?.get('offset')).toBe('0');
  });

  it('поиск и быстрая дата уходят в запрос и складываются', async () => {
    const { last } = fakeApi();
    const user = userEvent.setup();
    renderFeed();

    await user.type(await screen.findByRole('searchbox'), 'бег{Enter}');
    await waitFor(() => expect(last()?.get('q')).toBe('бег'));
    // Форма не пересоздаётся: фокус остаётся в поиске
    expect(screen.getByRole('searchbox')).toBe(document.activeElement);
    await user.click(screen.getByRole('radio', { name: 'Завтра' }));
    await waitFor(() => expect(last()?.get('date')).toBe('tomorrow'));
    expect(last()?.get('q')).toBe('бег');
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('бег');
  });

  it('прочие фильтры свёрнуты; включённые видны числом на «Фильтрах»', async () => {
    const { last } = fakeApi();
    const user = userEvent.setup();
    renderFeed();

    const more = (await screen.findByText('Фильтры')).closest('details');
    expect(more?.open).toBe(false);
    await user.click(screen.getByText('Фильтры'));
    await user.selectOptions(screen.getByLabelText('Уровень'), 'Новичок');
    await waitFor(() => expect(last()?.get('level')).toBe('beginner'));
    await user.selectOptions(screen.getByLabelText('Группа направлений'), 'Зимние');
    await waitFor(() => expect(last()?.get('category')).toBe('winter'));
    await user.type(screen.getByLabelText('Район'), 'Центральный');
    await user.click(screen.getByRole('button', { name: 'Применить' }));
    await waitFor(() => expect(last()?.get('area')).toBe('Центральный'));
    expect(last()?.get('level')).toBe('beginner');
    screen.getByText('Фильтры · 3');
  });

  it('смена фильтра не сворачивает «Фильтры», не сбрасывает фокус и набранный текст', async () => {
    const { last } = fakeApi();
    const user = userEvent.setup();
    renderFeed();

    await user.click(await screen.findByText('Фильтры'));
    const more = screen.getByText('Фильтры').closest('details');
    await user.type(screen.getByLabelText('Город'), 'Дивногорск');
    const mode = screen.getByLabelText('Запись');
    await user.selectOptions(mode, 'По заявке');

    await waitFor(() => expect(last()?.get('mode')).toBe('approval'));
    expect(last()?.get('city')).toBe('Дивногорск');
    expect((screen.getByLabelText('Город') as HTMLInputElement).value).toBe('Дивногорск');
    expect(more?.open).toBe(true);
    expect(mode).toBe(document.activeElement);

    await user.click(screen.getByRole('radio', { name: 'Сегодня' }));
    await waitFor(() => expect(last()?.get('date')).toBe('today'));
    expect(screen.getByRole('radio', { name: 'Сегодня' })).toBe(document.activeElement);
  });

  it('фильтр по направлению: выбор из подсказок уходит в запрос, пустое поле его снимает', async () => {
    const { last } = fakeApi();
    const user = userEvent.setup();
    renderFeed();
    await user.click(await screen.findByText('Фильтры'));

    const field = screen.getByRole('combobox', { name: 'Направление' });
    await user.type(field, 'кёрл');
    const list = await screen.findByRole('listbox', { name: 'Подсказки' });
    expect(within(list).getAllByRole('option')).toHaveLength(2);
    // Набранный текст без выбора фильтром не становится
    expect(last()?.has('sport')).toBe(false);
    await user.click(screen.getByRole('option', { name: 'Кёрлинг на льду' }));

    await waitFor(() => expect(last()?.get('sport')).toBe(CURLING.id));
    expect(last()?.has('sportName')).toBe(false);
    expect(field).toHaveProperty('value', CURLING.name);
    screen.getByText('Фильтры · 1');

    await user.clear(field);
    await waitFor(() => expect(last()?.has('sport')).toBe(false));
  });

  it('фильтр по направлению с клавиатуры: стрелка и Enter выбирают, форма не отправляется', async () => {
    const { last } = fakeApi();
    const user = userEvent.setup();
    renderFeed();
    await user.click(await screen.findByText('Фильтры'));

    const field = screen.getByRole('combobox', { name: 'Направление' });
    await user.type(field, 'кёрл');
    await screen.findByRole('listbox', { name: 'Подсказки' });
    await user.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => expect(last()?.get('sport')).toBe(SPORTS[1]?.id));
    expect(field).toBe(document.activeElement);

    // Не выбранный текст после ухода из поля возвращается к выбранному направлению
    await user.type(field, ' что-то');
    await user.tab();
    expect(field).toHaveProperty('value', 'Кёрлинг');
  });

  it('направление из адреса: в запросе id, в поле — название', async () => {
    const { last } = fakeApi();
    const user = userEvent.setup();
    renderFeed(`/?sport=${CURLING.id}&sportName=${encodeURIComponent(CURLING.name)}`);
    await waitFor(() => expect(last()?.get('sport')).toBe(CURLING.id));
    await user.click(screen.getByText('Фильтры · 1'));
    expect(screen.getByRole('combobox', { name: 'Направление' })).toHaveProperty(
      'value',
      CURLING.name,
    );
  });

  it('направление из адреса без названия: поле не выглядит пустым фильтром', async () => {
    const { last } = fakeApi();
    const user = userEvent.setup();
    renderFeed(`/?sport=${CURLING.id}`);
    await waitFor(() => expect(last()?.get('sport')).toBe(CURLING.id));
    await user.click(screen.getByText('Фильтры · 1'));
    expect(screen.getByRole('combobox', { name: 'Направление' })).toHaveProperty(
      'placeholder',
      'Выбрано направление',
    );
  });

  it('у каждого пункта «Уровня» своя подпись: «без фильтра» не путается с «Любой»', async () => {
    const { last } = fakeApi();
    const user = userEvent.setup();
    renderFeed();
    await user.click(await screen.findByText('Фильтры'));
    const level = screen.getByLabelText('Уровень') as HTMLSelectElement;
    const labels = Array.from(level.options).map((option) => option.text);
    expect(labels).toEqual(['Все уровни', 'Новичок', 'Любитель', 'Опытный', 'Любой']);
    await user.selectOptions(level, 'Любой');
    await waitFor(() => expect(last()?.get('level')).toBe('any'));
    await user.selectOptions(level, 'Все уровни');
    await waitFor(() => expect(last()?.has('level')).toBe(false));
  });

  it('фильтры из адреса: ссылкой можно поделиться', async () => {
    const { last } = fakeApi();
    renderFeed('/?date=weekend&mode=approval&level=pro');
    await waitFor(() => expect(last()?.get('date')).toBe('weekend'));
    expect(last()?.get('mode')).toBe('approval');
    expect(last()?.has('level')).toBe(false);
    expect((screen.getByRole('radio', { name: 'Выходные' }) as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it('пустой результат — одна строка и «Создайте своё событие»', async () => {
    fakeApi(0);
    renderFeed();
    await screen.findByText('Ничего не нашлось — попробуйте другие фильтры');
    expect(screen.getByRole('link', { name: 'Создайте своё событие' }).getAttribute('href')).toBe(
      '/create',
    );
  });

  it('«Показать ещё» догружает следующую страницу', async () => {
    const { last } = fakeApi(25);
    const user = userEvent.setup();
    renderFeed();

    await screen.findByText('Найдено: 25');
    expect(screen.getAllByRole('listitem').filter((li) => li.matches('.feed-card'))).toHaveLength(
      20,
    );
    await user.click(screen.getByRole('button', { name: 'Показать ещё' }));
    await waitFor(() => expect(last()?.get('offset')).toBe('20'));
    await screen.findByRole('link', { name: /Событие 25/ });
    expect(screen.queryByRole('button', { name: 'Показать ещё' })).toBeNull();
  });

  it('ошибка ленты — «Повторить» загружает заново', async () => {
    fakeApi(1, (_offset, attempt) => attempt === 1);
    const user = userEvent.setup();
    renderFeed();
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Что-то пошло не так. Попробуйте ещё раз',
    );
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    await screen.findByRole('link', { name: /Пробежка 5 км на Татышеве/ });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('«Показать ещё»: фокус на первой новой карточке, ошибка — рядом с кнопкой', async () => {
    fakeApi(45, (offset, attempt) => offset === 40 && attempt === 3);
    const user = userEvent.setup();
    renderFeed();
    await screen.findByText('Найдено: 45');
    await user.click(screen.getByRole('button', { name: 'Показать ещё' }));
    await waitFor(() => expect(document.activeElement?.textContent).toContain('Событие 21'));
    await user.click(screen.getByRole('button', { name: 'Показать ещё' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Что-то пошло не так. Попробуйте ещё раз',
    );
    // Загруженное остаётся, догрузить можно снова
    expect(screen.getAllByRole('listitem').filter((li) => li.matches('.feed-card'))).toHaveLength(
      40,
    );
    screen.getByRole('button', { name: 'Показать ещё' });
  });

  it('во время «Повторить» — статус загрузки, кнопка неактивна', async () => {
    let release: () => void = () => undefined;
    const third = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Лента загрузилась, перечитывание упало (например, после перемотки демо-часов),
    // «Повторить» — третий запрос, его ответ задержан
    const { feedRequests } = fakeApi(
      1,
      (_offset, attempt) => attempt === 2,
      (attempt) => (attempt === 3 ? third : undefined),
    );
    const client = createQueryClient();
    const user = userEvent.setup();
    render(
      <AppProviders client={client}>
        <MemoryRouter initialEntries={['/']}>
          <AppRoutes />
        </MemoryRouter>
      </AppProviders>,
    );
    await screen.findByRole('link', { name: /Пробежка 5 км на Татышеве/ });
    await client.refetchQueries({ queryKey: ['feed'] });
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(await screen.findByText('Загрузка…')).toBeTruthy();
    const retry = screen.getByRole('button', { name: 'Повторить' });
    expect(retry.getAttribute('aria-disabled')).toBe('true');
    // Повторное нажатие, пока идёт запрос, нового запроса не делает
    const requests = feedRequests.length;
    await user.click(retry);
    expect(feedRequests).toHaveLength(requests);
    expect(screen.queryByRole('alert')).toBeNull();

    release();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Повторить' })).toBeNull());
    expect(screen.queryByText('Загрузка…')).toBeNull();
    // Кнопка с фокусом исчезла — фокус на первой карточке, а не на body
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('link', { name: /Пробежка 5 км на Татышеве/ }),
      ),
    );
  });

  it('фильтр сменили, пока шла догрузка: её ответ фокус с фильтров не уводит', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    // 1 — лента, 2 — «Показать ещё», 3 — «Сегодня», 4 — «Показать ещё» на «Сегодня» (задержан)
    fakeApi(
      45,
      () => false,
      (attempt) => (attempt === 4 ? held : undefined),
    );
    const user = userEvent.setup();
    renderFeed();
    await screen.findByText('Найдено: 45');
    await user.click(screen.getByRole('button', { name: 'Показать ещё' }));
    await waitFor(() => expect(document.activeElement?.textContent).toContain('Событие 21'));
    await user.click(screen.getByRole('radio', { name: 'Сегодня' }));
    await waitFor(() =>
      expect(screen.getAllByRole('listitem').filter((li) => li.matches('.feed-card'))).toHaveLength(
        20,
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Показать ещё' }));
    // Вернулся к «Любому дню» — там из кеша 40 карточек, и 21-я есть
    const anyDay = screen.getByRole('radio', { name: 'Любой день' });
    await user.click(anyDay);
    await waitFor(() =>
      expect(screen.getAllByRole('listitem').filter((li) => li.matches('.feed-card'))).toHaveLength(
        40,
      ),
    );
    release();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(document.activeElement).toBe(anyDay);
  });

  it('фокус на первой новой карточке и после смены фильтров с тем же индексом', async () => {
    fakeApi(45);
    const user = userEvent.setup();
    renderFeed();
    await screen.findByText('Найдено: 45');
    await user.click(screen.getByRole('button', { name: 'Показать ещё' }));
    await waitFor(() => expect(document.activeElement?.textContent).toContain('Событие 21'));

    // Другой фильтр — лента заново с первой страницы, догрузка снова начинается с 21-й
    await user.click(screen.getByRole('radio', { name: 'Сегодня' }));
    await waitFor(() =>
      expect(screen.getAllByRole('listitem').filter((li) => li.matches('.feed-card'))).toHaveLength(
        20,
      ),
    );
    const more = screen.getByRole('button', { name: 'Показать ещё' });
    await user.click(more);
    await waitFor(() => expect(document.activeElement?.textContent).toContain('Событие 21'));
    expect(document.activeElement).not.toBe(more);
  });

  it('обложка — содержательная: alt — название группы', async () => {
    fakeApi();
    renderFeed();
    const link = await screen.findByRole('link', { name: /Пробежка 5 км на Татышеве/ });
    expect(link.querySelector('img')?.getAttribute('alt')).toBe('Выносливость');
  });
});
