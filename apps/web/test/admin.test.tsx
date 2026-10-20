import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, AppRoutes, createQueryClient } from '../src/App';

const adminMe = {
  id: 'a1',
  role: 'admin',
  name: 'Администратор',
  email: 'admin@demo',
  organization: null,
};
const userMe = { ...adminMe, id: 'u1', role: 'user', name: 'Анна', email: 'anna@demo' };

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const pending = {
  id: 'o1',
  name: 'Падел-клуб',
  description: 'Турниры по паделу',
  city: 'Красноярск',
  contacts: '+7 391 000-00-02',
  website: null,
  representativeName: 'Иван Петров',
  representativeRole: 'Тренер',
  status: 'pending',
  decisionReason: null,
  submittedAt: '2026-10-19T05:00:00Z',
  sports: [{ id: 's1', name: 'Падел' }],
};

const event = {
  id: 'e1',
  title: 'Турнир по паделу',
  sport: { id: 's1', name: 'Падел' },
  organizer: { kind: 'organization', id: 'o1', name: 'Падел-клуб' },
  startsAt: '2026-10-22T12:00:00Z',
  city: 'Красноярск',
  status: 'unpublished',
  statusReason: 'Реклама',
  createdAt: '2026-10-19T05:00:00Z',
};

type EventRow = Omit<typeof event, 'statusReason'> & { statusReason: string | null };

/** api админки в памяти: решения меняют статусы, запросы записываются. */
function fakeAdminApi(me: typeof adminMe = adminMe, eventRows: EventRow[] = [event]) {
  const organizations = [{ ...pending }];
  const events = eventRows.map((row) => ({ ...row }));
  const calls: { call: string; body?: unknown }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const call = `${init?.method ?? 'GET'} ${url}`;
    const body = init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined;
    calls.push({ call, body });
    if (call === 'GET /api/me') return json(200, me);
    if (call === 'GET /api/clock') {
      return json(200, { now: '2026-10-19T12:00:00Z', demoMode: false, standId: null });
    }
    if (call === 'GET /api/admin/overview') {
      return json(200, {
        pendingOrganizations: 3,
        unpublishedEventsLastWeek: 1,
        hiddenMessages: 2,
      });
    }
    if (call.startsWith('GET /api/admin/organizations')) {
      return json(200, { items: organizations, total: organizations.length, limit: 20, offset: 0 });
    }
    if (call === 'POST /api/admin/organizations/o1/decision') {
      const { decision, reason } = body as { decision: string; reason?: string };
      if (decision === 'reject' && !reason?.trim()) {
        return json(400, {
          code: 'validation_failed',
          message: 'Проверьте поля',
          fields: { reason: 'Укажите причину отказа' },
        });
      }
      Object.assign(organizations[0] ?? {}, {
        status: decision === 'approve' ? 'approved' : 'rejected',
        decisionReason: reason?.trim() ?? null,
      });
      return json(200, organizations[0]);
    }
    if (call.startsWith('GET /api/admin/events')) {
      // 45 строк — чтобы было куда листать
      const offset = Number(new URL(url, 'http://x').searchParams.get('offset') ?? 0);
      return json(200, { items: events, total: 45, limit: 20, offset });
    }
    const moderation = /^POST \/api\/admin\/events\/(\w+)\/moderation$/.exec(call);
    if (moderation) {
      const { action, reason } = body as { action: string; reason: string };
      if (!reason.trim()) {
        return json(400, {
          code: 'validation_failed',
          message: 'Проверьте поля',
          fields: { reason: 'Укажите причину' },
        });
      }
      const row = events.find(({ id }) => id === moderation[1]);
      Object.assign(row ?? {}, {
        status: action === 'unpublish' ? 'unpublished' : 'deleted',
        statusReason: reason.trim(),
      });
      return json(200, row);
    }
    if (call.startsWith('GET /api/admin/messages')) {
      return json(200, {
        items: [
          {
            id: 'm1',
            eventId: 'e1',
            eventTitle: 'Турнир по паделу',
            author: { kind: 'user', id: 'u2', name: 'Пётр' },
            text: 'Купите абонемент со скидкой',
            moderationReason: 'Реклама',
            createdAt: '2026-10-19T05:00:00Z',
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      });
    }
    if (call === 'GET /api/events/e1/messages') {
      return json(200, [
        {
          id: 't1',
          author: { name: 'Анна' },
          isOrganizer: false,
          text: 'Нужна своя ракетка?',
          placeholder: null,
          createdAt: '2026-10-19T05:00:00Z',
          replies: [
            {
              id: 't2',
              author: { name: 'Падел-клуб' },
              isOrganizer: true,
              text: 'Дадим на месте',
              placeholder: null,
              createdAt: '2026-10-19T06:00:00Z',
            },
          ],
        },
      ]);
    }
    return json(404, { code: 'not_found', message: 'Не найдено' });
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

function renderAt(path: string) {
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

describe('админка', () => {
  it('не администратору — объяснение вместо раздела, данные админки не запрашиваются', async () => {
    const calls = fakeAdminApi(userMe);
    renderAt('/admin');
    expect(await screen.findByText('Раздел доступен только администратору.')).toBeTruthy();
    expect(calls.some(({ call }) => call.includes('/api/admin/'))).toBe(false);
  });

  it('обзор: три плитки со счётчиками ведут к своим спискам', async () => {
    fakeAdminApi();
    renderAt('/admin');
    const tiles = within(await screen.findByRole('list', { name: 'Обзор' })).getAllByRole('link');
    expect(
      tiles.map((tile) => [tile.getAttribute('aria-label'), tile.getAttribute('href')]),
    ).toEqual([
      ['Заявки организаций ждут решения: 3', '/admin/organizations?status=pending'],
      ['События сняты за неделю: 1', '/admin/events?status=unpublished&period=week'],
      ['Скрытые сообщения: 2', '/admin/messages'],
    ]);
    // Есть что разбирать — плитка заявок в тоне «ждёт»
    expect(tiles[0]?.className).toContain('admin-tile--wait');
  });

  it('«Одобрить» отправляет решение, заявка показывает новый статус', async () => {
    const calls = fakeAdminApi();
    renderAt('/admin/organizations?status=pending');
    expect(await screen.findByText('Иван Петров, Тренер')).toBeTruthy();
    expect(calls.map(({ call }) => call)).toContain('GET /api/admin/organizations?status=pending');

    await userEvent.click(screen.getByRole('button', { name: 'Одобрить' }));
    expect(
      await screen.findByText('Допущена к публикации', { selector: '.admin-status' }),
    ).toBeTruthy();
    expect(calls.find(({ call }) => call.startsWith('POST'))?.body).toEqual({
      decision: 'approve',
    });
    expect(screen.queryByRole('button', { name: 'Одобрить' })).toBeNull();
  });

  it('«Отклонить» — сначала причина; без неё ошибка у поля', async () => {
    const calls = fakeAdminApi();
    renderAt('/admin/organizations');
    await userEvent.click(await screen.findByRole('button', { name: 'Отклонить' }));
    const reason = screen.getByLabelText('Причина отказа — её увидит организация');
    // Пробелы проходят required браузера, но не api
    await userEvent.type(reason, '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Отклонить с этой причиной' }));
    expect(await screen.findByText('Укажите причину отказа')).toBeTruthy();
    expect(reason.getAttribute('aria-invalid')).toBe('true');

    await userEvent.clear(reason);
    await userEvent.type(reason, 'Не указаны контакты');
    await userEvent.click(screen.getByRole('button', { name: 'Отклонить с этой причиной' }));
    expect(await screen.findByText('Отклонена', { selector: '.admin-status' })).toBeTruthy();
    expect(screen.getByText('Не указаны контакты')).toBeTruthy();
    expect(calls.filter(({ call }) => call.startsWith('POST')).at(-1)?.body).toEqual({
      decision: 'reject',
      reason: 'Не указаны контакты',
    });
  });

  it('поиск — в адресе; из организации — её мероприятия, из мероприятия — организатор и обсуждение', async () => {
    const calls = fakeAdminApi();
    renderAt('/admin/organizations');
    await userEvent.type(await screen.findByLabelText('Название'), 'падел');
    await userEvent.selectOptions(screen.getByLabelText('Статус'), 'pending');
    await userEvent.click(screen.getByRole('button', { name: 'Найти' }));
    await waitFor(() =>
      expect(calls.map(({ call }) => call)).toContain(
        'GET /api/admin/organizations?q=%D0%BF%D0%B0%D0%B4%D0%B5%D0%BB&status=pending',
      ),
    );
    expect(screen.getByRole('link', { name: 'Мероприятия организации' }).getAttribute('href')).toBe(
      '/admin/events?organizationId=o1',
    );

    cleanup();
    fakeAdminApi();
    renderAt('/admin/events?organizationId=o1');
    expect(
      await screen.findByText('Снято с публикации', { selector: '.admin-status' }),
    ).toBeTruthy();
    expect(screen.getByText('Реклама')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Падел-клуб' }).getAttribute('href')).toBe(
      '/admin/organizations?id=o1',
    );

    // Обсуждение — прямо в строке мероприятия
    await userEvent.click(screen.getByRole('button', { name: 'Обсуждение' }));
    expect(await screen.findByText(/Нужна своя ракетка\?/)).toBeTruthy();
    expect(screen.getByText(/Дадим на месте/)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Скрыть обсуждение' }).getAttribute('aria-expanded'),
    ).toBe('true');
  });

  it('списки листаются по 20: смещение — в адресе', async () => {
    const calls = fakeAdminApi();
    renderAt('/admin/events');
    expect(await screen.findByText('Найдено: 45, показаны 1–1')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Назад' }).hasAttribute('disabled')).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Дальше' }));
    await waitFor(() =>
      expect(calls.map(({ call }) => call)).toContain('GET /api/admin/events?offset=20'),
    );
  });

  it('«Снять с публикации» — только с причиной; после решения строка показывает статус и причину', async () => {
    const calls = fakeAdminApi(adminMe, [{ ...event, status: 'published', statusReason: null }]);
    renderAt('/admin/events');
    await userEvent.click(await screen.findByRole('button', { name: 'Снять с публикации' }));
    const reason = screen.getByLabelText('Причина — её увидят организатор и записавшиеся');
    await userEvent.type(reason, '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Снять с этой причиной' }));
    expect(await screen.findByText('Укажите причину')).toBeTruthy();
    expect(reason.getAttribute('aria-invalid')).toBe('true');

    await userEvent.clear(reason);
    await userEvent.type(reason, 'Сведения устарели');
    await userEvent.click(screen.getByRole('button', { name: 'Снять с этой причиной' }));
    expect(
      await screen.findByText('Снято с публикации', { selector: '.admin-status' }),
    ).toBeTruthy();
    expect(screen.getByText('Сведения устарели')).toBeTruthy();
    expect(calls.filter(({ call }) => call.startsWith('POST')).at(-1)).toEqual({
      call: 'POST /api/admin/events/e1/moderation',
      body: { action: 'unpublish', reason: 'Сведения устарели' },
    });
    // Снятое можно только удалить
    expect(screen.queryByRole('button', { name: 'Снять с публикации' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Удалить' })).toBeTruthy();
  });

  it('удалённому — ни снятия, ни удаления; «Отмена» закрывает форму без запроса', async () => {
    const calls = fakeAdminApi(adminMe, [
      { ...event, id: 'e2', status: 'deleted', statusReason: 'Мошенничество' },
      event,
    ]);
    renderAt('/admin/events');
    expect(await screen.findByText('Удалено', { selector: '.admin-status' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Удалить' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Снять с публикации' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(screen.getByRole('button', { name: 'Удалить' })).toBeTruthy();
    expect(calls.some(({ call }) => call.startsWith('POST'))).toBe(false);
  });

  it('скрытые сообщения: текст, причина, автор и мероприятие', async () => {
    fakeAdminApi();
    renderAt('/admin/messages');
    expect(await screen.findByText('Купите абонемент со скидкой')).toBeTruthy();
    expect(screen.getByText('Реклама')).toBeTruthy();
    expect(screen.getByText('Пётр')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Турнир по паделу' })).toBeTruthy();
  });

  it('в профиле администратора — ссылка на админку', async () => {
    fakeAdminApi();
    renderAt('/profile');
    expect(
      (
        await screen.findByRole('link', { name: 'Админка: заявки организаций и поиск' })
      ).getAttribute('href'),
    ).toBe('/admin');
  });
});
