import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, AppRoutes, createQueryClient } from '../src/App';

const anna = { id: 'u1', role: 'user', name: 'Анна', email: 'anna@demo', organization: null };

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const SPORTS = [
  { id: 'sport-run', name: 'Бег', category: 'endurance', isCustom: false },
  { id: 'sport-ski', name: 'Беговые лыжи', category: 'winter', isCustom: false },
];

/** Api в памяти: вошедшая Анна, подсказки направлений и создание мероприятия. */
function fakeApi(createResponse: () => Response = () => json(201, { id: 'event-1' })) {
  const created: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const { pathname, searchParams } = new URL(url, 'http://stand');
      if (method === 'GET' && pathname === '/api/me') return json(200, anna);
      if (method === 'GET' && pathname === '/api/clock') {
        return json(200, {
          now: '2026-10-19T12:00:00Z',
          demoMode: false,
          standId: null,
          lastResetAt: null,
        });
      }
      if (method === 'GET' && pathname === '/api/sports') {
        const q = (searchParams.get('q') ?? '').toLowerCase();
        const items = SPORTS.filter((sport) => sport.name.toLowerCase().startsWith(q));
        return json(200, { items, exactMatch: items.some((s) => s.name.toLowerCase() === q) });
      }
      if (method === 'POST' && pathname === '/api/events') {
        created.push(JSON.parse(String(init?.body)));
        return createResponse();
      }
      return json(404, { code: 'not_found', message: 'Не найдено' });
    }),
  );
  return { created };
}

function renderCreate() {
  return render(
    <AppProviders client={createQueryClient()}>
      <MemoryRouter initialEntries={['/create']}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Текст, на который ссылается aria-describedby поля: ошибка рядом с полем. */
const describedBy = (element: HTMLElement) =>
  document.getElementById(element.getAttribute('aria-describedby') ?? '')?.textContent;

const currentStep = () =>
  screen.getByRole('list', { name: 'Шаги создания мероприятия' }).querySelector('[aria-current]');

/** Первые шаги — только с клавиатуры: ввод, стрелки и Enter. */
async function fillWhatAndWhere(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Название'), 'Пробежка по набережной');
  await user.type(screen.getByRole('combobox', { name: 'Направление' }), 'бег');
  await screen.findByRole('option', { name: 'Бег' });
  await user.keyboard('{ArrowDown}{Enter}');
  expect((screen.getByRole('combobox', { name: 'Направление' }) as HTMLInputElement).value).toBe(
    'Беговые лыжи',
  );
  await user.type(screen.getByLabelText('Описание'), 'Пять километров в спокойном темпе');
  // Из описания Tab ведёт на «Далее»
  await user.tab();
  expect(screen.getByRole('button', { name: 'Далее' })).toBe(document.activeElement);
  await user.keyboard('{Enter}');

  expect(await screen.findByRole('heading', { name: /Шаг 2 из 4/ })).toBe(document.activeElement);
  await user.type(screen.getByLabelText('Дата'), '2026-10-25');
  await user.type(screen.getByLabelText('Начало'), '19:00');
  await user.type(screen.getByLabelText('Окончание'), '20:30');
  await user.type(screen.getByLabelText('Район или ориентир'), 'Центральный');
  await user.type(
    screen.getByLabelText('Адрес или как найти место'),
    'Набережная у Коммунального моста',
  );
  await user.keyboard('{Enter}');
}

describe('создание мероприятия', { timeout: 15_000 }, () => {
  it('четыре шага, предпросмотр карточки, «Опубликовать» ведёт в карточку', async () => {
    const { created } = fakeApi();
    const user = userEvent.setup();
    renderCreate();

    await screen.findByRole('heading', { name: 'Создать мероприятие' });
    expect(currentStep()?.textContent).toContain('Что');
    await fillWhatAndWhere(user);

    expect(await screen.findByRole('heading', { name: /Шаг 3 из 4/ })).toBe(document.activeElement);
    expect(currentStep()?.textContent).toContain('Условия');
    // Необязательное свёрнуто в «Дополнительно»
    const more = screen.getByText('Дополнительно').closest('details');
    expect(more?.hasAttribute('open')).toBe(false);
    await user.click(screen.getByRole('radio', { name: 'Любитель' }));
    await user.click(screen.getByText('Дополнительно'));
    await user.type(
      screen.getByLabelText('Информация для участников (видна только записанным)'),
      'Сбор у входа',
    );
    await user.click(screen.getByRole('button', { name: 'Далее' }));

    expect(await screen.findByRole('heading', { name: /Шаг 4 из 4/ })).toBe(document.activeElement);
    await user.click(screen.getByRole('radio', { name: /По заявке/ }));
    await user.click(screen.getByText('Дополнительно'));
    await user.type(screen.getByLabelText('Вопрос к заявке'), 'Сколько бегаете?');

    const preview = within(screen.getByRole('region', { name: 'Так увидят участники' }));
    preview.getByRole('heading', { name: 'Пробежка по набережной' });
    preview.getByText('Беговые лыжи');
    preview.getByText('По заявке');
    preview.getByText('Любитель');
    preview.getByText('19:00–20:30');
    preview.getByText('Красноярск, Центральный, Набережная у Коммунального моста');

    await user.click(screen.getByRole('button', { name: 'Опубликовать' }));
    await screen.findByRole('heading', { name: 'Мероприятие' });
    expect(created).toEqual([
      {
        title: 'Пробежка по набережной',
        description: 'Пять километров в спокойном темпе',
        sportId: 'sport-ski',
        startsAt: '2026-10-25T12:00:00.000Z',
        endsAt: '2026-10-25T13:30:00.000Z',
        city: 'Красноярск',
        area: 'Центральный',
        placeText: 'Набережная у Коммунального моста',
        participantInfo: 'Сбор у входа',
        mode: 'approval',
        applyQuestion: 'Сколько бегаете?',
        level: 'amateur',
      },
    ]);
  });

  it('направления нет — «Добавить «…» как новое направление» и необязательная группа', async () => {
    const { created } = fakeApi();
    const user = userEvent.setup();
    renderCreate();

    await user.type(await screen.findByLabelText('Название'), 'Падел для новичков');
    await user.type(screen.getByRole('combobox', { name: 'Направление' }), 'Падел');
    const add = await screen.findByRole('option', {
      name: 'Добавить «Падел» как новое направление',
    });
    expect(add.getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{Enter}');
    await user.selectOptions(
      screen.getByLabelText('Группа нового направления (необязательно)'),
      'Командные',
    );
    await user.type(screen.getByLabelText('Описание'), 'Играем пара на пару');
    await user.click(screen.getByRole('button', { name: 'Далее' }));

    await screen.findByRole('heading', { name: /Шаг 2 из 4/ });
    await user.click(screen.getByRole('button', { name: 'Назад' }));
    expect((screen.getByRole('combobox', { name: 'Направление' }) as HTMLInputElement).value).toBe(
      'Падел',
    );
    expect(created).toEqual([]);
  });

  it('ошибки шага — простыми словами у полей, дальше не пускает', async () => {
    fakeApi();
    const user = userEvent.setup();
    renderCreate();

    await user.click(await screen.findByRole('button', { name: 'Далее' }));
    expect(describedBy(screen.getByLabelText('Название'))).toBe('Название — от 5 до 80 символов');
    expect(describedBy(screen.getByRole('combobox', { name: 'Направление' }))).toBe(
      'Выберите направление из списка или добавьте новое',
    );
    expect(describedBy(screen.getByLabelText('Описание'))).toBe('Добавьте описание');
    expect(currentStep()?.textContent).toContain('Что');
    // Фокус — на первое поле с ошибкой: диктор прочитает его и ошибку
    expect(screen.getByLabelText('Название')).toBe(document.activeElement);

    // Исправленное поле больше не подсвечено
    await user.type(screen.getByLabelText('Название'), 'Пробежка по набережной');
    expect(screen.getByLabelText('Название').hasAttribute('aria-invalid')).toBe(false);
  });

  it('ошибку сервера показывает у поля на его шаге', async () => {
    fakeApi(() =>
      json(400, {
        code: 'validation_failed',
        message: 'Проверьте поля формы',
        fields: { startsAt: 'Время начала должно быть в будущем' },
      }),
    );
    const user = userEvent.setup();
    renderCreate();
    await fillWhatAndWhere(user);
    await user.click(await screen.findByRole('radio', { name: 'Новичок' }));
    await user.click(screen.getByRole('button', { name: 'Далее' }));
    await user.click(await screen.findByRole('radio', { name: /Свободно/ }));
    await user.click(screen.getByRole('button', { name: 'Опубликовать' }));

    await waitFor(() => expect(currentStep()?.textContent).toContain('Когда и где'));
    expect(describedBy(screen.getByLabelText('Начало'))).toBe('Время начала должно быть в будущем');
    expect(screen.getByLabelText('Начало')).toBe(document.activeElement);
    expect(screen.getByRole('alert')?.textContent).toContain('исправьте отмеченное');
    const steps = screen.getByRole('list', { name: 'Шаги создания мероприятия' });
    expect(within(steps).getAllByRole('listitem')[0]?.getAttribute('data-state')).toBe('done');
  });

  it('ошибки сервера на разных шагах: степпер отмечает оба, ошибка позднего шага не теряется', async () => {
    let attempt = 0;
    const { created } = fakeApi(() => {
      attempt += 1;
      return attempt === 1
        ? json(400, {
            code: 'validation_failed',
            message: 'Проверьте поля формы',
            fields: {
              startsAt: 'Время начала должно быть в будущем',
              applyQuestion: 'В тексте есть недопустимые символы',
            },
          })
        : json(201, { id: 'event-2' });
    });
    const user = userEvent.setup();
    renderCreate();
    await fillWhatAndWhere(user);
    await user.click(await screen.findByRole('radio', { name: 'Новичок' }));
    await user.click(screen.getByRole('button', { name: 'Далее' }));
    await user.click(await screen.findByRole('radio', { name: /По заявке/ }));
    await user.click(screen.getByText('Дополнительно'));
    await user.type(screen.getByLabelText('Вопрос к заявке'), 'Опыт?');
    await user.click(screen.getByRole('button', { name: 'Опубликовать' }));

    await waitFor(() => expect(currentStep()?.textContent).toContain('Когда и где'));
    const states = () =>
      within(screen.getByRole('list', { name: 'Шаги создания мероприятия' }))
        .getAllByRole('listitem')
        .map((item) => item.getAttribute('data-state'));
    expect(states()).toEqual(['done', 'current', 'upcoming', 'error']);

    await user.clear(screen.getByLabelText('Начало'));
    await user.type(screen.getByLabelText('Начало'), '19:30');
    await user.click(screen.getByRole('button', { name: 'Далее' }));
    await user.click(await screen.findByRole('button', { name: 'Далее' }));

    await screen.findByRole('heading', { name: /Шаг 4 из 4/ });
    const question = screen.getByLabelText('Вопрос к заявке');
    expect(describedBy(question)).toBe('В тексте есть недопустимые символы');
    const more = question.closest('details');
    expect(more?.open).toBe(true);
    // Исправление поля не сворачивает «Дополнительно»
    await user.clear(question);
    await user.type(question, 'Сколько бегаете?');
    expect(more?.open).toBe(true);
    expect(question.hasAttribute('aria-invalid')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Опубликовать' }));
    await screen.findByRole('heading', { name: 'Мероприятие' });
    expect(created).toHaveLength(2);
    expect(created[1]).toMatchObject({
      startsAt: '2026-10-25T12:30:00.000Z',
      applyQuestion: 'Сколько бегаете?',
    });
  });

  it('ошибка без полей — сообщением над кнопкой, шаг не меняется', async () => {
    fakeApi(() => json(403, { code: 'forbidden', message: 'Создавать мероприятия нельзя' }));
    const user = userEvent.setup();
    renderCreate();
    await fillWhatAndWhere(user);
    await user.click(await screen.findByRole('radio', { name: 'Новичок' }));
    await user.click(screen.getByRole('button', { name: 'Далее' }));
    await user.click(await screen.findByRole('radio', { name: /Свободно/ }));
    await user.click(screen.getByRole('button', { name: 'Опубликовать' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Создавать мероприятия нельзя');
    expect(currentStep()?.textContent).toContain('Запись');
  });
});

describe('подсказки направлений с клавиатуры', { timeout: 15_000 }, () => {
  const combobox = () => screen.getByRole('combobox', { name: 'Направление' });
  const options = () => screen.queryAllByRole('option').map((option) => option.textContent);
  const selected = () =>
    screen
      .queryAllByRole('option')
      .find((option) => option.getAttribute('aria-selected') === 'true')?.textContent;

  it('стрелки ходят по кругу, Escape закрывает, стрелка вниз открывает снова', async () => {
    fakeApi();
    const user = userEvent.setup();
    renderCreate();

    await user.type(await screen.findByRole('combobox', { name: 'Направление' }), 'бе');
    await screen.findByRole('option', { name: 'Бег' });
    expect(options()).toEqual(['Бег', 'Беговые лыжи', 'Добавить «бе» как новое направление']);
    expect(selected()).toBe('Бег');
    await user.keyboard('{ArrowUp}');
    expect(selected()).toBe('Добавить «бе» как новое направление');
    await user.keyboard('{ArrowDown}');
    expect(selected()).toBe('Бег');

    await user.keyboard('{Escape}');
    expect(options()).toEqual([]);
    expect(combobox().getAttribute('aria-expanded')).toBe('false');
    await user.keyboard('{ArrowDown}');
    expect(options()).toHaveLength(3);
  });

  it('«Добавить» — только когда точного совпадения нет и введено от 2 символов', async () => {
    fakeApi();
    const user = userEvent.setup();
    renderCreate();

    await user.type(await screen.findByRole('combobox', { name: 'Направление' }), 'бег');
    await screen.findByRole('option', { name: 'Бег' });
    expect(options()).toEqual(['Бег', 'Беговые лыжи']);

    await user.clear(combobox());
    await user.type(combobox(), 'П');
    await waitFor(() =>
      expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('q=%D0%9F&'))).toBe(
        true,
      ),
    );
    expect(options()).toEqual([]);
    await user.type(combobox(), 'а');
    await screen.findByRole('option', { name: 'Добавить «Па» как новое направление' });
  });

  it('правка текста снимает выбранное направление', async () => {
    fakeApi();
    const user = userEvent.setup();
    renderCreate();

    await user.type(await screen.findByLabelText('Название'), 'Пробежка по набережной');
    await user.type(combobox(), 'бег');
    await screen.findByRole('option', { name: 'Бег' });
    await user.keyboard('{Enter}');
    await user.type(combobox(), 'ун');
    await user.keyboard('{Escape}');
    await user.type(screen.getByLabelText('Описание'), 'Пять километров');
    await user.click(screen.getByRole('button', { name: 'Далее' }));

    expect(describedBy(combobox())).toBe('Выберите направление из списка или добавьте новое');
    expect(currentStep()?.textContent).toContain('Что');
  });
});
