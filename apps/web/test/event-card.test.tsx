import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Action } from '@tandem/domain';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, AppRoutes, createQueryClient } from '../src/App';
import {
  actionLabel,
  actionTarget,
  findAction,
  primaryAction,
  secondaryActions,
} from '../src/features/event-card/actions';

const anna = { id: 'u1', role: 'user', name: 'Анна', email: 'anna@demo', organization: null };

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const card = (patch: Record<string, unknown> = {}) => ({
  id: 'e1',
  title: 'Пробежка 5 км на Татышеве',
  description: 'Бежим в спокойном темпе.\nПосле — чай.',
  sport: { id: 's1', name: 'Бег', category: 'endurance', isCustom: false },
  organizer: { kind: 'organization', id: 'o1', name: 'Беговой клуб «Енисей»' },
  startsAt: '2026-10-21T00:30:00.000Z',
  endsAt: '2026-10-21T01:30:00.000Z',
  previousStartsAt: null,
  city: 'Красноярск',
  area: 'Остров Татышев',
  placeText: 'Вход у моста',
  mode: 'free',
  applyQuestion: null,
  level: 'amateur',
  status: 'published',
  statusReason: null,
  displayStatus: 'open',
  participation: null,
  participationReason: null,
  participantInfo: null,
  capacity: null,
  confirmedCount: 0,
  actions: [{ code: 'join', enabled: true }],
  ...patch,
});

const guestJoin: Action = {
  code: 'join',
  enabled: false,
  requiresAuth: true,
  reason: 'Войдите, чтобы записаться',
};

interface FakeOptions {
  signedIn?: boolean;
  /** Карточка для вошедшего и для гостя. */
  cardFor?: (signedIn: boolean) => Response;
}

function fakeApi({ signedIn = false, cardFor }: FakeOptions = {}) {
  let me = signedIn;
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = `${init?.method ?? 'GET'} ${url}`;
      calls.push(call);
      switch (call) {
        case 'GET /api/me':
          return me ? json(200, anna) : json(401, { code: 'unauthorized', message: 'Войдите' });
        case 'GET /api/clock':
          return json(200, {
            now: '2026-10-19T12:00:00Z',
            demoMode: false,
            standId: null,
            lastResetAt: null,
          });
        case 'POST /api/auth/login':
          me = true;
          return json(200, anna);
        case 'GET /api/events/e1':
          return cardFor ? cardFor(me) : json(200, me ? card() : card({ actions: [guestJoin] }));
        case 'POST /api/events/e1/join':
          return json(201, { status: 'confirmed' });
        case 'POST /api/events/e1/leave':
          return json(200, { status: 'cancelled' });
        default:
          return json(404, { code: 'not_found', message: 'Не найдено' });
      }
    }),
  );
  return { calls };
}

function renderCard(path = '/events/e1') {
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

describe('действия карточки по actions[]', () => {
  const join: Action = { code: 'join', enabled: true };
  const leave: Action = { code: 'leave', enabled: true };
  const message: Action = { code: 'post_message', enabled: false, reason: 'Только участникам' };
  const cancel: Action = { code: 'cancel_event', enabled: true };

  it('главная кнопка — запись или отмена записи, остальное — прочие действия', () => {
    expect(primaryAction([message, join])).toBe(join);
    expect(primaryAction([message, leave])).toBe(leave);
    expect(primaryAction([message, cancel])).toBeUndefined();
    expect(secondaryActions([join, message, cancel])).toEqual([message, cancel]);
  });

  it('«Изменить» и «Участники и заявки» — только по своим кодам, не среди прочих действий', () => {
    const edit: Action = { code: 'edit_event', enabled: true };
    const participants: Action = { code: 'view_participants', enabled: true };
    expect(findAction([message, edit], 'edit_event')).toBe(edit);
    expect(findAction([message, cancel], 'edit_event')).toBeUndefined();
    expect(secondaryActions([join, edit, participants, cancel])).toEqual([cancel]);
  });

  it('подпись записи — по режиму', () => {
    expect(actionLabel('join', 'free')).toBe('Записаться');
    expect(actionLabel('join', 'approval')).toBe('Подать заявку');
    expect(actionLabel('leave', 'free')).toBe('Отменить запись');
  });

  it('адреса действий: управление — экран изменения, сообщение — обсуждение, модерация — нет', () => {
    expect(actionTarget('reschedule_event', 'e1')).toBe('/events/e1/edit');
    expect(actionTarget('cancel_event', 'e1')).toBe('/events/e1/edit');
    expect(actionTarget('post_message', 'e1')).toBe('#discussion');
    expect(actionTarget('unpublish_event', 'e1')).toBeNull();
    expect(actionTarget('delete_event', 'e1')).toBeNull();
  });
});

describe('карточка мероприятия', { timeout: 15_000 }, () => {
  it('первый экран: обложка, название, дата, место, уровень, статус и одна главная кнопка', async () => {
    fakeApi({ signedIn: true });
    renderCard();

    const article = await screen.findByRole('article', { name: 'Пробежка 5 км на Татышеве' });
    const inCard = within(article);
    expect(inCard.getByRole('img', { name: 'Выносливость' })).toBeTruthy();
    // Направление — в строке над названием (до 768 px может быть обрезано) и полностью в «Условиях»
    expect(inCard.getAllByText('Бег')).toHaveLength(2);
    inCard.getByText('07:30–08:30');
    inCard.getByText('Любитель');
    // Место — в первом блоке и полностью в «Условиях»
    expect(inCard.getAllByText('Красноярск, Остров Татышев, Вход у моста')).toHaveLength(2);
    inCard.getByText('Набор открыт');
    inCard.getByText('Свободно');
    // Места — между местом и панелью действия (docs/design.md, «Первый экран карточки»)
    const seats = inCard.getByText('Без ограничения мест');
    const first = article.querySelector('.event-card-first');
    expect(first?.contains(seats)).toBe(true);
    expect(inCard.getAllByRole('button')).toHaveLength(1);
    inCard.getByRole('button', { name: 'Записаться' });
    expect(inCard.getByRole('link', { name: 'Беговой клуб «Енисей»' }).getAttribute('href')).toBe(
      '/organizations/o1',
    );

    // «Об активности» и «Условия» свёрнуты, места под вопросы и обсуждение есть
    const about = inCard.getByText('Об активности').closest('details');
    expect(about?.open).toBe(false);
    expect(about?.textContent).toContain('Бежим в спокойном темпе.');
    expect(inCard.getByText('Условия').closest('details')?.open).toBe(false);
    inCard.getByRole('heading', { name: 'Частые вопросы' });
    inCard.getByRole('heading', { name: 'Обсуждение' });
  });

  it('места: «Осталось N из M» по ответу карточки, при полном наборе — «Мест нет»', async () => {
    fakeApi({
      signedIn: true,
      cardFor: () => json(200, card({ capacity: 10, confirmedCount: 7 })),
    });
    renderCard();
    const article = await screen.findByRole('article', { name: 'Пробежка 5 км на Татышеве' });
    within(article).getByText('Осталось 3 из 10');
    expect(article.querySelectorAll('.seats-dots i[data-taken]')).toHaveLength(7);
    cleanup();

    fakeApi({
      signedIn: true,
      cardFor: () => json(200, card({ capacity: 10, confirmedCount: 10, displayStatus: 'full' })),
    });
    renderCard();
    const full = await screen.findByRole('article', { name: 'Пробежка 5 км на Татышеве' });
    expect(full.querySelector('.seats--full')?.textContent).toBe('Мест нет');
  });

  it('больше 10 мест — полоса, а не кружки: ряд кружков на 360 px перенёсся бы', async () => {
    fakeApi({
      signedIn: true,
      cardFor: () => json(200, card({ capacity: 16, confirmedCount: 4 })),
    });
    renderCard();
    const article = await screen.findByRole('article', { name: 'Пробежка 5 км на Татышеве' });
    within(article).getByText('Осталось 12 из 16');
    expect(article.querySelector('.seats-dots')).toBeNull();
    expect(article.querySelector('.seats-bar')).not.toBeNull();
  });

  it('гость: кнопка ведёт на вход, после входа запись выполняется сама', async () => {
    const { calls } = fakeApi();
    const user = userEvent.setup();
    renderCard();

    await screen.findByRole('button', { name: 'Записаться' });
    await user.click(screen.getByRole('button', { name: 'Записаться' }));
    expect(calls).not.toContain('POST /api/events/e1/join');

    await user.type(await screen.findByLabelText('Почта'), 'anna@demo');
    await user.type(screen.getByLabelText('Пароль'), 'demo');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    await screen.findByRole('article', { name: 'Пробежка 5 км на Татышеве' });
    await waitFor(() => expect(calls).toContain('POST /api/events/e1/join'));
    expect(calls.filter((call) => call === 'POST /api/events/e1/join')).toHaveLength(1);
    // После записи карточка перечитана
    await waitFor(() =>
      expect(calls.lastIndexOf('GET /api/events/e1')).toBeGreaterThan(
        calls.indexOf('POST /api/events/e1/join'),
      ),
    );
  });

  it('участник: в панели — статус записи, строка полного статуса, информация участникам', async () => {
    fakeApi({
      cardFor: () =>
        json(
          200,
          card({
            mode: 'approval',
            applyQuestion: 'Сколько бегаете?',
            participation: 'confirmed',
            participantInfo: 'Сбор у входа в 7:20',
            actions: [{ code: 'join', enabled: false, reason: 'Вы уже участник' }],
          }),
        ),
    });
    const user = userEvent.setup();
    renderCard();

    const button = await screen.findByRole('button', { name: 'Подать заявку' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    screen.getByText('Вы участник');
    const full = screen.getByText('Набор открыт. Вы участник');
    // Кнопка ссылается на строку полного статуса
    expect(button.getAttribute('aria-describedby')).toBe(full.id);

    await user.click(screen.getByText('Условия'));
    screen.getByText('Сколько бегаете?');
    screen.getByRole('heading', { name: 'Информация для участников' });
    screen.getByText('Сбор у входа в 7:20');
  });

  it('от 768 px статус в панели — полным текстом, отдельной строки полного статуса нет', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(min-width: 768px)',
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    fakeApi({
      cardFor: () =>
        json(
          200,
          card({
            participation: 'confirmed',
            actions: [{ code: 'join', enabled: false, reason: 'Вы уже участник' }],
          }),
        ),
    });
    renderCard();
    const full = await screen.findByText('Набор открыт. Вы участник');
    expect(full.closest('.status')).not.toBeNull();
    expect(screen.queryByText('Вы участник')).toBeNull();
    expect(document.querySelector('.event-card-full-status')).toBeNull();
  });

  it('отменённое мероприятие — статус с причиной', async () => {
    fakeApi({
      cardFor: () =>
        json(
          200,
          card({
            status: 'cancelled',
            displayStatus: 'cancelled',
            statusReason: 'Гроза',
            actions: [{ code: 'join', enabled: false, reason: 'Мероприятие отменено' }],
          }),
        ),
    });
    renderCard();
    await screen.findByText('Отменено организатором');
    screen.getByText('Отменено организатором. Причина: Гроза');
  });

  it('организатор: «Изменить», вкладка «Участники и заявки», прочие действия по actions[]', async () => {
    fakeApi({
      cardFor: () =>
        json(
          200,
          card({
            actions: [
              {
                code: 'join',
                enabled: false,
                reason: 'Нельзя записаться на своё мероприятие',
                reasonCode: 'own_event',
              },
              { code: 'edit_event', enabled: true },
              { code: 'view_participants', enabled: true },
              { code: 'post_message', enabled: true },
              { code: 'reschedule_event', enabled: true },
              { code: 'cancel_event', enabled: false, reason: 'Мероприятие уже идёт' },
            ],
          }),
        ),
    });
    const user = userEvent.setup();
    renderCard();

    const edit = await screen.findByRole('link', { name: 'Изменить' });
    // Кнопка недоступна, а статус говорит «можно»: в панели — короткая причина, полная — строкой
    screen.getByText('Это ваше мероприятие');
    screen.getByText('Набор открыт. Нельзя записаться на своё мероприятие');
    expect(edit.getAttribute('href')).toBe('/events/e1/edit');
    expect(screen.getByRole('link', { name: 'Перенести' }).getAttribute('href')).toBe(
      '/events/e1/edit',
    );
    expect(screen.getByRole('link', { name: 'Написать в обсуждение' }).getAttribute('href')).toBe(
      '#discussion',
    );
    screen.getByText('Отменить мероприятие: Мероприятие уже идёт');

    const cardTab = screen.getByRole('tab', { name: 'Карточка' });
    expect(cardTab.getAttribute('aria-selected')).toBe('true');
    cardTab.focus();
    await user.keyboard('{ArrowRight}');
    const participants = screen.getByRole('tab', { name: 'Участники и заявки' });
    expect(participants.getAttribute('aria-selected')).toBe('true');
    expect(participants).toBe(document.activeElement);
    // Фокус Tab — только на выбранной вкладке; панель, на которую ссылается вкладка, есть
    expect(participants.tabIndex).toBe(0);
    expect(cardTab.tabIndex).toBe(-1);
    expect(document.getElementById(cardTab.getAttribute('aria-controls') ?? '')).not.toBeNull();
    screen.getByText('Здесь будут участники и заявки на это мероприятие.');
    expect(screen.queryByRole('article')).toBeNull();

    await user.keyboard('{ArrowLeft}');
    expect(cardTab.getAttribute('aria-selected')).toBe('true');
    expect(cardTab).toBe(document.activeElement);
    screen.getByRole('article', { name: 'Пробежка 5 км на Татышеве' });
  });

  it('администратор: модерация не ведёт на экран изменения организатора', async () => {
    fakeApi({
      cardFor: () =>
        json(
          200,
          card({
            actions: [
              { code: 'join', enabled: false, reason: 'Администратор не записывается' },
              { code: 'unpublish_event', enabled: true },
              { code: 'delete_event', enabled: true },
            ],
          }),
        ),
    });
    renderCard();

    await screen.findByText('Снять с публикации — в разделе модерации');
    screen.getByText('Удалить — в разделе модерации');
    expect(screen.queryByRole('link', { name: /Снять с публикации|Удалить|Изменить/ })).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('запись: кнопка заблокирована на время запроса, ошибка сервера — рядом', async () => {
    let release: (response: Response) => void = () => undefined;
    const { calls } = fakeApi({ signedIn: true });
    const base = vi.mocked(fetch).getMockImplementation();
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (String(url) === '/api/events/e1/join') {
        calls.push('POST /api/events/e1/join');
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      }
      return base ? base(url, init) : json(404, {});
    });
    const user = userEvent.setup();
    renderCard();

    const button = await screen.findByRole('button', { name: 'Записаться' });
    await user.click(button);
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));
    release(json(409, { code: 'event_full', message: 'Мест нет' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Мест нет');
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    expect(calls.filter((call) => call === 'POST /api/events/e1/join')).toHaveLength(1);
  });

  it('отмена записи — своим запросом', async () => {
    const { calls } = fakeApi({
      signedIn: true,
      cardFor: () =>
        json(
          200,
          card({ participation: 'confirmed', actions: [{ code: 'leave', enabled: true }] }),
        ),
    });
    const user = userEvent.setup();
    renderCard();
    await user.click(await screen.findByRole('button', { name: 'Отменить запись' }));
    await waitFor(() => expect(calls).toContain('POST /api/events/e1/leave'));
  });

  it('участнику вкладок организатора нет', async () => {
    fakeApi({ signedIn: true });
    renderCard();
    await screen.findByRole('article', { name: 'Пробежка 5 км на Татышеве' });
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Изменить' })).toBeNull();
  });

  it('недоступное мероприятие — понятный текст и путь к ленте', async () => {
    fakeApi({
      cardFor: () => json(404, { code: 'event_not_available', message: 'Мероприятие недоступно' }),
    });
    renderCard();
    await screen.findByText('Мероприятие недоступно');
    expect(screen.getByRole('link', { name: 'Найти другое занятие' }).getAttribute('href')).toBe(
      '/',
    );
  });

  it('«Изменить» — только по edit_event: без него ссылки нет, неактивное — с причиной', async () => {
    let actions: Action[] = [
      { code: 'reschedule_event', enabled: false, reason: 'Мероприятие уже началось' },
      { code: 'cancel_event', enabled: false, reason: 'Мероприятие уже началось' },
    ];
    fakeApi({ cardFor: () => json(200, card({ actions })) });
    renderCard();
    await screen.findByRole('article', { name: 'Пробежка 5 км на Татышеве' });
    expect(screen.queryByRole('link', { name: 'Изменить' })).toBeNull();
    cleanup();

    actions = [
      {
        code: 'edit_event',
        enabled: false,
        reason: 'Мероприятие уже началось: изменить его нельзя',
      },
    ];
    renderCard();
    await screen.findByText('Изменить: Мероприятие уже началось: изменить его нельзя');
    expect(screen.queryByRole('link', { name: 'Изменить' })).toBeNull();
  });

  it('гостю прочее действие ведёт на вход с возвратом', async () => {
    fakeApi({
      cardFor: () =>
        json(
          200,
          card({
            actions: [
              guestJoin,
              { code: 'post_message', enabled: false, requiresAuth: true, reason: 'Войдите' },
            ],
          }),
        ),
    });
    renderCard();
    const link = await screen.findByRole('link', { name: 'Написать в обсуждение' });
    expect(link.getAttribute('href')).toBe('/login?next=%2Fevents%2Fe1');
  });

  it('отказ с ошибкой поля — текст поля, а не «Проверьте поля формы»', async () => {
    fakeApi({ signedIn: true });
    const base = vi.mocked(fetch).getMockImplementation();
    vi.mocked(fetch).mockImplementation(async (url, init) =>
      String(url) === '/api/events/e1/join'
        ? json(400, {
            code: 'validation_failed',
            message: 'Проверьте поля формы',
            fields: { answer: 'Ответьте на вопрос организатора' },
          })
        : base
          ? base(url, init)
          : json(404, {}),
    );
    const user = userEvent.setup();
    renderCard();
    await user.click(await screen.findByRole('button', { name: 'Записаться' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Ответьте на вопрос организатора');
  });
});
