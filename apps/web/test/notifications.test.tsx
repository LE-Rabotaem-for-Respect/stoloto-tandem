import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, AppRoutes, createQueryClient } from '../src/App';

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const items = [
  {
    id: 'n2',
    type: 'event_unpublished',
    icon: 'action-hide',
    text: '«Волейбол» снято с публикации модератором. Причина: Спам',
    link: '/events/2',
    createdAt: '2026-10-19T11:00:00Z',
    read: false,
  },
  {
    id: 'n1',
    type: 'participation_confirmed',
    icon: 'status-confirmed',
    text: 'Заявка на «Скалолазание» принята — вы участник',
    link: '/events/1',
    createdAt: '2026-10-19T10:00:00Z',
    read: true,
  },
];

function fakeApi(signedIn: boolean) {
  let unread = 1;
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = `${init?.method ?? 'GET'} ${url}`;
      calls.push(call);
      switch (call) {
        case 'GET /api/me':
          return signedIn
            ? json(200, {
                id: 'u1',
                role: 'user',
                name: 'Анна',
                email: 'anna@demo',
                organization: null,
              })
            : json(401, { code: 'unauthorized', message: 'Войдите' });
        case 'GET /api/clock':
          return json(200, {
            now: '2026-10-19T12:00:00Z',
            demoMode: false,
            standId: null,
            lastResetAt: null,
          });
        case 'GET /api/notifications':
          return json(200, { items, unread });
        case 'POST /api/notifications/read':
          unread = 0;
          return json(200, { unread });
        default:
          return json(404, { code: 'not_found', message: 'Не найдено' });
      }
    }),
  );
  return { calls };
}

function renderAt(path: string) {
  render(
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

describe('уведомления в web', () => {
  it('у пункта «Уведомления» — счётчик непрочитанных', async () => {
    fakeApi(true);
    renderAt('/');
    const nav = screen.getByRole('navigation', { name: 'Основные разделы' });
    const link = within(nav).getByRole('link', { name: /Уведомления/ });
    await waitFor(() => expect(link.textContent).toContain('1 непрочитанных'));
  });

  it('гостю уведомления не запрашиваются и счётчика нет', async () => {
    const api = fakeApi(false);
    renderAt('/');
    await screen.findByRole('link', { name: 'Войти' });
    expect(api.calls).not.toContain('GET /api/notifications');
  });

  it('центр: строка с переходом на экран, открытие отмечает прочитанными', async () => {
    const api = fakeApi(true);
    renderAt('/notifications');

    const row = await screen.findByRole('link', { name: /Волейбол.*снято с публикации/ });
    expect(row.getAttribute('href')).toBe('/events/2');
    expect(screen.getByRole('link', { name: /Скалолазание/ }).getAttribute('href')).toBe(
      '/events/1',
    );
    await waitFor(() => expect(api.calls).toContain('POST /api/notifications/read'));

    const nav = screen.getByRole('navigation', { name: 'Основные разделы' });
    await waitFor(() =>
      expect(within(nav).getByRole('link', { name: /Уведомления/ }).textContent).not.toContain(
        'непрочитанных',
      ),
    );
  });
});
