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

/** api админки в памяти: решения меняют статус заявки, запросы записываются. */
function fakeAdminApi(me: typeof adminMe = adminMe) {
  const organizations = [{ ...pending }];
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
      return json(200, { items: [event], total: 1, limit: 20, offset: 0 });
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
    expect(tiles.map((tile) => [tile.textContent, tile.getAttribute('href')])).toEqual([
      ['3Заявки организаций ждут решения', '/admin/organizations?status=pending'],
      ['1События сняты за неделю', '/admin/events?status=unpublished'],
      ['2Скрытые сообщения', '/admin/events'],
    ]);
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
      '/admin/organizations?q=%D0%9F%D0%B0%D0%B4%D0%B5%D0%BB-%D0%BA%D0%BB%D1%83%D0%B1',
    );
    expect(screen.getByRole('link', { name: 'Обсуждение' }).getAttribute('href')).toBe(
      '/events/e1#discussion',
    );
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
