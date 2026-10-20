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

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

interface SportRow {
  id: string;
  name: string;
  category: string;
  isCustom: boolean;
  status: 'active' | 'hidden';
  aliases: string[];
  eventCount: number;
}

const padel: SportRow = {
  id: 's1',
  name: 'Падел клуб',
  category: 'other',
  isCustom: true,
  status: 'active',
  aliases: [],
  eventCount: 2,
};
const target: SportRow = {
  id: 's2',
  name: 'Падел',
  category: 'team',
  isCustom: false,
  status: 'active',
  aliases: ['паддл'],
  eventCount: 5,
};
const hidden: SportRow = {
  id: 's3',
  name: 'Футбол на ушах',
  category: 'team',
  isCustom: true,
  status: 'hidden',
  aliases: [],
  eventCount: 1,
};

/** api каталога в памяти: изменения меняют строки, запросы записываются. */
function fakeApi() {
  const sports = [padel, target, hidden].map((row) => ({ ...row }));
  const calls: { call: string; body?: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = `${init?.method ?? 'GET'} ${url}`;
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, string>) : {};
      calls.push({ call, body });
      if (call === 'GET /api/me') return json(200, adminMe);
      if (call === 'GET /api/clock') {
        return json(200, { now: '2026-10-19T12:00:00Z', demoMode: false, standId: null });
      }
      if (call.startsWith('GET /api/admin/sports')) {
        return json(200, { items: sports, total: sports.length, limit: 20, offset: 0 });
      }
      if (call.startsWith('GET /api/sports')) {
        return json(200, {
          items: sports.filter((row) => row.status === 'active'),
          exactMatch: false,
        });
      }
      const change = /^POST \/api\/admin\/sports\/(\w+)\/(\w+)$/.exec(call);
      const row = sports.find(({ id }) => id === change?.[1]);
      if (change && row) {
        if (change[2] === 'rename') {
          if (body.name === 'Падел') {
            return json(400, {
              code: 'validation_failed',
              message: 'Проверьте поля',
              fields: { name: 'Такое направление уже есть: «Падел». Объедините с ним' },
            });
          }
          row.aliases = [row.name.toLowerCase()];
          row.name = body.name ?? row.name;
        }
        if (change[2] === 'hide') row.status = 'hidden';
        if (change[2] === 'merge') {
          row.status = 'hidden';
          const into = sports.find(({ id }) => id === body.targetId);
          if (into) into.aliases = [...into.aliases, row.name.toLowerCase()];
          return json(200, into);
        }
        return json(200, row);
      }
      return json(404, { code: 'not_found', message: 'Не найдено' });
    }),
  );
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

const rowOf = async (name: string) =>
  (await screen.findByRole('heading', { name })).closest('li') as HTMLElement;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('каталог направлений в админке', () => {
  it('строка: статус, группа, число мероприятий и прежние названия; фильтр — в запросе api', async () => {
    const calls = fakeApi();
    renderAt('/admin/sports?status=custom');
    const row = within(await rowOf('Падел клуб'));
    expect(row.getByText('Пользовательское', { selector: '.admin-status' })).toBeTruthy();
    expect(row.getByText('Другое')).toBeTruthy();
    expect(row.getByText('2')).toBeTruthy();
    expect(row.getByRole('button', { name: 'В основной список' })).toBeTruthy();
    expect(within(await rowOf('Падел')).getByText('паддл')).toBeTruthy();
    expect(calls.map(({ call }) => call)).toContain(
      'GET /api/admin/sports?status=active&custom=true',
    );
    // У скрытого действий нет, у основного нет «В основной список»
    expect(within(await rowOf('Футбол на ушах')).queryByRole('button')).toBeNull();
    expect(
      within(await rowOf('Падел')).queryByRole('button', { name: 'В основной список' }),
    ).toBeNull();
    expect(screen.getByRole('link', { name: 'Направления' }).getAttribute('href')).toBe(
      '/admin/sports',
    );
  });

  it('«Переименовать»: ошибка api — у поля; успех — новое имя и прежнее в строке', async () => {
    const calls = fakeApi();
    renderAt('/admin/sports');
    const row = within(await rowOf('Падел клуб'));
    await userEvent.click(row.getByRole('button', { name: 'Переименовать' }));
    const input = row.getByLabelText('Новое название');
    await userEvent.clear(input);
    await userEvent.type(input, 'Падел');
    await userEvent.click(row.getByRole('button', { name: 'Сохранить название' }));
    expect(
      await row.findByText('Такое направление уже есть: «Падел». Объедините с ним'),
    ).toBeTruthy();
    expect(input.getAttribute('aria-invalid')).toBe('true');

    await userEvent.clear(input);
    await userEvent.type(input, 'Падел-клуб');
    await userEvent.click(row.getByRole('button', { name: 'Сохранить название' }));
    const renamed = within(await rowOf('Падел-клуб'));
    expect(renamed.getByText('падел клуб')).toBeTruthy();
    expect(calls.filter(({ call }) => call.startsWith('POST')).at(-1)).toEqual({
      call: 'POST /api/admin/sports/s1/rename',
      body: { name: 'Падел-клуб' },
    });
  });

  it('«Объединить с…»: целевое из подсказок без самого дубля, подтверждение, запрос', async () => {
    const calls = fakeApi();
    renderAt('/admin/sports');
    const row = within(await rowOf('Падел клуб'));
    await userEvent.click(row.getByRole('button', { name: 'Объединить с…' }));
    expect(row.getByRole('button', { name: 'Объединить' }).hasAttribute('disabled')).toBe(true);
    await userEvent.type(
      row.getByLabelText('Найти направление, в которое перенести мероприятия'),
      'пад',
    );
    const choices = within(await row.findByRole('list', { name: 'Подходящие направления' }));
    expect(choices.getAllByRole('button').map((button) => button.textContent)).toEqual(['Падел']);
    await userEvent.click(choices.getByRole('button', { name: 'Падел' }));
    expect(row.getByText(/Мероприятия «Падел клуб» перейдут в «Падел»/)).toBeTruthy();

    await userEvent.click(row.getByRole('button', { name: 'Объединить' }));
    await waitFor(() =>
      expect(calls.filter(({ call }) => call.startsWith('POST')).at(-1)).toEqual({
        call: 'POST /api/admin/sports/s1/merge',
        body: { targetId: 's2' },
      }),
    );
    expect(await within(await rowOf('Падел')).findByText('паддл, падел клуб')).toBeTruthy();
  });

  it('«Скрыть» — после подтверждения; «Отмена» закрывает без запроса', async () => {
    const calls = fakeApi();
    renderAt('/admin/sports');
    const row = within(await rowOf('Падел клуб'));
    await userEvent.click(row.getByRole('button', { name: 'Скрыть' }));
    expect(
      row.getByText(/Мероприятия останутся и будут показываться в группе «Другое»/),
    ).toBeTruthy();
    await userEvent.click(row.getByRole('button', { name: 'Отмена' }));
    expect(calls.some(({ call }) => call.startsWith('POST'))).toBe(false);

    await userEvent.click(row.getByRole('button', { name: 'Скрыть' }));
    await userEvent.click(row.getByRole('button', { name: 'Скрыть направление' }));
    expect(
      await within(await rowOf('Падел клуб')).findByText('Скрыто', { selector: '.admin-status' }),
    ).toBeTruthy();
    expect(calls.filter(({ call }) => call.startsWith('POST')).at(-1)?.call).toBe(
      'POST /api/admin/sports/s1/hide',
    );
  });
});
