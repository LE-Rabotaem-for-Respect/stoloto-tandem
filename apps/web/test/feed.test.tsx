import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, AppRoutes, createQueryClient } from '../src/App';
import { filterParams, hiddenFilterCount, readFilters } from '../src/features/feed/filters';

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
    // Лента загрузилась, повторная загрузка упала (например, после сброса демо-данных),
    // «Повторить» — третий запрос, его ответ задержан
    fakeApi(
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
    expect(screen.getByRole('button', { name: 'Повторить' })).toHaveProperty('disabled', true);
    expect(screen.queryByRole('alert')).toBeNull();

    release();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Повторить' })).toBeNull());
    expect(screen.queryByText('Загрузка…')).toBeNull();
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
