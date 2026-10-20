import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, AppRoutes, createQueryClient } from '../src/App';

const ORG_ID = '11111111-1111-4111-8111-111111111111';

interface Organization {
  id: string;
  name: string;
  description: string;
  city: string;
  contacts: string;
  website: string | null;
  representativeName: string;
  representativeRole: string;
  sports: { id: string; name: string; category: string }[];
  status: string;
  decisionReason: string | null;
  submittedAt: string | null;
}

const draft: Organization = {
  id: ORG_ID,
  name: 'Клуб «Падел»',
  description: '',
  city: '',
  contacts: '',
  website: null,
  representativeName: '',
  representativeRole: '',
  sports: [],
  status: 'draft',
  decisionReason: null,
  submittedAt: null,
};

const complete: Organization = {
  ...draft,
  description: 'Падел для начинающих\nи любителей',
  city: 'Красноярск',
  contacts: '+7 391 000-00-10',
  representativeName: 'Ольга',
  representativeRole: 'Тренер',
  sports: [{ id: 's-padel', name: 'Падел', category: 'other' }],
};

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

interface FakeOptions {
  role?: 'user' | 'org';
  organization?: Organization | null;
  signedIn?: boolean;
  submitFields?: Record<string, string>;
  events?: unknown[];
  eventsTotal?: number;
}

/** api в памяти: свой профиль организации, поиск направлений, лента её мероприятий. */
function fakeApi({
  role = 'org',
  organization = draft,
  signedIn = true,
  submitFields,
  events = [],
  eventsTotal = events.length,
}: FakeOptions = {}) {
  let current = organization;
  const calls: { call: string; body?: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = `${init?.method ?? 'GET'} ${url}`;
      const body = init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined;
      calls.push({ call, body });
      if (call === 'GET /api/me') {
        if (!signedIn) return json(401, { code: 'unauthorized', message: 'Войдите' });
        return json(200, {
          id: 'u-org',
          role,
          name: 'Ольга',
          email: 'padel@demo',
          organization:
            role === 'org' && current
              ? { id: current.id, name: current.name, status: current.status }
              : null,
        });
      }
      if (call === 'GET /api/clock') {
        return json(200, {
          now: '2026-10-21T05:00:00Z',
          demoMode: false,
          standId: null,
          lastResetAt: null,
        });
      }
      if (call === `GET /api/organizations/${ORG_ID}`) {
        return current ? json(200, current) : json(404, { code: 'not_found', message: 'Нет' });
      }
      if (call === `PATCH /api/organizations/${ORG_ID}` && current) {
        const { sportIds, website, ...profile } = body as Record<string, unknown> & {
          sportIds: string[];
          website: string;
        };
        current = {
          ...current,
          ...(profile as Partial<Organization>),
          website: website || null,
          sports: sportIds.map((id) => ({
            id,
            name: id === 's-padel' ? 'Падел' : id,
            category: 'other',
          })),
        };
        return json(200, current);
      }
      if (call === `POST /api/organizations/${ORG_ID}/submit` && current) {
        if (submitFields) {
          return json(400, {
            code: 'validation_failed',
            message: 'Проверьте поля',
            fields: submitFields,
          });
        }
        current = { ...current, status: 'pending', decisionReason: null };
        return json(200, current);
      }
      if (call.startsWith('GET /api/sports?q=')) {
        // Как у сервера: запрос длиннее предела — ошибка поля
        if (decodeURIComponent(url.split('q=')[1]?.split('&')[0] ?? '').includes('!')) {
          return json(400, {
            code: 'validation_failed',
            message: 'В запросе есть недопустимые символы',
          });
        }
        return json(200, {
          items: [
            { id: 's-padel', name: 'Падел', category: 'other', isCustom: false },
            { id: 's-tennis', name: 'Теннис', category: 'other', isCustom: false },
          ],
        });
      }
      if (call === `GET /api/events?organization=${ORG_ID}&limit=50`) {
        return json(200, { items: events, total: eventsTotal, limit: 50, offset: 0 });
      }
      return json(404, { code: 'not_found', message: 'Не найдено' });
    }),
  );
  return { calls };
}

function renderApp(path: string) {
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

const stepper = () => screen.findByRole('list', { name: /Путь организации/ });

describe('своя организация: /organization', () => {
  it('черновик: заполнить профиль, выбрать направление и отправить на проверку', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi();
    renderApp('/organization');

    expect((await stepper()).getAttribute('aria-label')).toBe('Путь организации: шаг 1 из 4');
    await user.type(screen.getByLabelText('Чем занимается организация'), 'Падел для начинающих');
    await user.type(screen.getByLabelText('Город'), 'Красноярск');
    await user.type(screen.getByLabelText('Контакты'), '+7 391 000-00-10');
    await user.type(screen.getByLabelText('Представитель'), 'Ольга');
    await user.type(screen.getByLabelText('Роль представителя'), 'Тренер');
    await user.type(screen.getByLabelText('Найти направление'), 'пад');
    await user.click(await screen.findByRole('button', { name: /Добавить «Падел»/ }));
    expect(screen.getByRole('button', { name: 'Убрать «Падел»' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Отправить на проверку' }));

    expect(await screen.findByText('На рассмотрении')).toBeTruthy();
    expect((await stepper()).getAttribute('aria-label')).toBe('Путь организации: шаг 2 из 4');
    expect(screen.queryByRole('button', { name: 'Отправить на проверку' })).toBeNull();
    const writes = calls.filter(({ call }) => !call.startsWith('GET'));
    expect(writes.map(({ call }) => call)).toEqual([
      `PATCH /api/organizations/${ORG_ID}`,
      `POST /api/organizations/${ORG_ID}/submit`,
    ]);
    expect(writes[0]?.body).toEqual({
      name: 'Клуб «Падел»',
      description: 'Падел для начинающих',
      city: 'Красноярск',
      contacts: '+7 391 000-00-10',
      website: '',
      representativeName: 'Ольга',
      representativeRole: 'Тренер',
      sportIds: ['s-padel'],
    });
  });

  it('незаполненные поля — ошибки у полей из ответа api', async () => {
    const user = userEvent.setup();
    fakeApi({
      submitFields: { city: 'Укажите город', sportIds: 'Выберите хотя бы одно направление' },
    });
    renderApp('/organization');
    await user.click(await screen.findByRole('button', { name: 'Отправить на проверку' }));

    const city = screen.getByLabelText('Город');
    expect(await screen.findByText('Укажите город')).toBeTruthy();
    expect(city.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Выберите хотя бы одно направление')).toBeTruthy();
  });

  it('отклонена: причина на шаге «Решение» и повторная отправка', async () => {
    const user = userEvent.setup();
    fakeApi({
      organization: {
        ...complete,
        status: 'rejected',
        decisionReason: 'Не указаны контакты представителя',
      },
    });
    renderApp('/organization');

    const steps = await stepper();
    const decision = within(steps).getByText(/Решение: отклонена/);
    expect(decision.textContent).toContain('Не указаны контакты представителя');
    expect(steps.getAttribute('aria-label')).toBe('Путь организации: шаг 3 из 4');

    await user.click(screen.getByRole('button', { name: 'Отправить на проверку' }));
    expect(await screen.findByText('На рассмотрении')).toBeTruthy();
    expect(screen.queryByText(/Не указаны контакты представителя/)).toBeNull();
  });

  it('«Сохранить» меняет профиль без отправки', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi({ organization: { ...complete, status: 'pending' } });
    renderApp('/organization');
    const city = await screen.findByLabelText('Город');
    await user.clear(city);
    await user.type(city, 'Дивногорск');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Сохранено');
    expect(calls.map(({ call }) => call)).not.toContain(`POST /api/organizations/${ORG_ID}/submit`);
    expect(calls.find(({ call }) => call.startsWith('PATCH'))?.body).toMatchObject({
      city: 'Дивногорск',
      sportIds: ['s-padel'],
    });
  });

  it('одобрена: создание мероприятия обычным экраном и ссылка на публичную страницу', async () => {
    fakeApi({ organization: { ...complete, status: 'approved' } });
    renderApp('/organization');

    expect((await stepper()).getAttribute('aria-label')).toBe('Путь организации: шаг 4 из 4');
    expect(screen.getByRole('link', { name: 'Создать мероприятие' }).getAttribute('href')).toBe(
      '/create',
    );
    expect(screen.getByRole('link', { name: 'Публичная страница' }).getAttribute('href')).toBe(
      `/organizations/${ORG_ID}`,
    );
    expect(screen.queryByRole('button', { name: 'Отправить на проверку' })).toBeNull();
  });

  it('направления с клавиатуры: фокус не теряется после «Добавить» и «Убрать»', async () => {
    const user = userEvent.setup();
    fakeApi();
    renderApp('/organization');
    const search = await screen.findByLabelText('Найти направление');
    expect(search.getAttribute('maxlength')).toBe('50');

    await user.type(search, 'пад');
    await user.click(await screen.findByRole('button', { name: /Добавить «Падел»/ }));
    expect(document.activeElement).toBe(search);
    await user.type(search, 'тен');
    await user.click(await screen.findByRole('button', { name: /Добавить «Теннис»/ }));

    await user.click(screen.getByRole('button', { name: 'Убрать «Падел»' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Убрать «Теннис»' }));
    await user.click(screen.getByRole('button', { name: 'Убрать «Теннис»' }));
    expect(document.activeElement).toBe(search);
  });

  it('ошибка поиска направлений видна, прошлые результаты не остаются', async () => {
    const user = userEvent.setup();
    fakeApi();
    renderApp('/organization');
    const search = await screen.findByLabelText('Найти направление');
    await user.type(search, 'пад');
    expect(await screen.findByRole('button', { name: /Добавить «Падел»/ })).toBeTruthy();
    await user.type(search, '!');
    expect((await screen.findByRole('alert')).textContent).toBe(
      'В запросе есть недопустимые символы',
    );
    expect(screen.queryByRole('button', { name: /Добавить «Падел»/ })).toBeNull();
  });

  it('после «Сохранить» название в /me обновляется', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi({ organization: complete });
    renderApp('/organization');
    const name = await screen.findByLabelText('Название');
    const before = calls.filter(({ call }) => call === 'GET /api/me').length;
    await user.clear(name);
    await user.type(name, 'Падел-клуб');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(calls.filter(({ call }) => call === 'GET /api/me').length).toBeGreaterThan(before),
    );
  });

  it('у сайта — предел длины, как у api', async () => {
    fakeApi();
    renderApp('/organization');
    const website = await screen.findByLabelText('Сайт (необязательно)');
    expect(website.getAttribute('maxlength')).toBe('300');
  });

  it('аккаунт человека: раздел не для него', async () => {
    fakeApi({ role: 'user', organization: null });
    renderApp('/organization');
    expect(await screen.findByText('Этот раздел — для аккаунтов организаций.')).toBeTruthy();
  });

  it('из профиля — ссылка на свою организацию', async () => {
    fakeApi({ organization: complete });
    renderApp('/profile');
    const link = await screen.findByRole('link', { name: 'Клуб «Падел»' });
    expect(link.getAttribute('href')).toBe('/organization');
  });
});

describe('публичная страница: /organizations/:id', () => {
  const event = {
    id: 'e1',
    title: 'Падел для новичков',
    sport: { id: 's-padel', name: 'Падел', category: 'other', isCustom: false },
    organizer: { kind: 'organization', id: ORG_ID, name: 'Клуб «Падел»' },
    startsAt: '2026-10-22T11:00:00Z',
    endsAt: '2026-10-22T13:00:00Z',
    city: 'Красноярск',
    area: 'Октябрьский',
    mode: 'free',
    level: 'beginner',
    displayStatus: 'open',
  };

  it('описание, направления, контакты и её мероприятия — гостю', async () => {
    fakeApi({
      signedIn: false,
      organization: { ...complete, status: 'approved', website: 'https://padel.example' },
      events: [event],
    });
    renderApp(`/organizations/${ORG_ID}`);

    expect(await screen.findByRole('heading', { name: 'Клуб «Падел»' })).toBeTruthy();
    expect(screen.getByText(/Падел для начинающих/)).toBeTruthy();
    expect(screen.getByText('+7 391 000-00-10')).toBeTruthy();
    const site = screen.getByRole('link', { name: 'https://padel.example' });
    expect(site.getAttribute('rel')).toContain('noopener');
    const link = await screen.findByRole('link', { name: 'Падел для новичков' });
    expect(link.getAttribute('href')).toBe('/events/e1');
    expect(screen.getByText('Падел · Красноярск, Октябрьский')).toBeTruthy();
    expect(screen.getByText('Набор открыт')).toBeTruthy();
  });

  it('мероприятий больше, чем показано, — подсказка про ленту', async () => {
    fakeApi({
      signedIn: false,
      organization: { ...complete, status: 'approved' },
      events: [event],
      eventsTotal: 64,
    });
    renderApp(`/organizations/${ORG_ID}`);
    expect(
      await screen.findByText('Показаны ближайшие 1 из 64 — остальные найдутся в ленте'),
    ).toBeTruthy();
  });

  it('длинный адрес сайта переносится, а не раздвигает страницу', async () => {
    fakeApi({
      signedIn: false,
      organization: {
        ...complete,
        status: 'approved',
        website: 'https://www.instagram.com/padel_krasnoyarsk_official_club/',
      },
    });
    renderApp(`/organizations/${ORG_ID}`);
    const link = await screen.findByRole('link', {
      name: 'https://www.instagram.com/padel_krasnoyarsk_official_club/',
    });
    expect(link.parentElement?.className).toBe('org-website');
  });

  it('нет открытых мероприятий — пустое состояние', async () => {
    fakeApi({ signedIn: false, organization: { ...complete, status: 'approved' } });
    renderApp(`/organizations/${ORG_ID}`);
    expect(await screen.findByText('Сейчас открытых мероприятий нет')).toBeTruthy();
  });

  it('сайт не http(s) — текстом, а не ссылкой', async () => {
    fakeApi({
      signedIn: false,
      organization: { ...complete, status: 'approved', website: 'javascript:alert(1)' },
    });
    renderApp(`/organizations/${ORG_ID}`);
    expect(await screen.findByText('javascript:alert(1)')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'javascript:alert(1)' })).toBeNull();
  });

  it('неодобренная или несуществующая — «Организация не найдена»', async () => {
    fakeApi({ signedIn: false, organization: null });
    renderApp(`/organizations/${ORG_ID}`);
    expect(await screen.findByRole('heading', { name: 'Организация не найдена' })).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Загрузка…')).toBeNull());
  });
});
