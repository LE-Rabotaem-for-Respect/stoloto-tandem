import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, AppRoutes, createQueryClient } from '../src/App';

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

interface StandState {
  /** Сброс отвечает ошибкой сервера. */
  resetFails?: boolean;
  /** Перемотку сервер отклоняет: сдвиг слишком большой. */
  clockFails?: boolean;
  /** Мероприятие не загружается. */
  eventFails?: boolean;
  demoMode: boolean;
  standId: string | null;
  lastResetAt: string | null;
  /** Время стенда: 12:00:30 по Красноярску — не на границе минуты, 05:00:30 UTC. */
  now: number;
}

/** Api стенда в памяти: часы, сброс, перемотка, вход и одно мероприятие. */
function fakeStand(state: Partial<StandState> = {}, eventEndsAt = '2026-10-19T07:30:00Z') {
  const stand: StandState = {
    demoMode: true,
    standId: 'stand-2',
    lastResetAt: '2026-10-19T04:00:00Z',
    now: Date.parse('2026-10-19T05:00:30Z'),
    ...state,
  };
  let signedIn = true;
  const calls: string[] = [];
  const bodies: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = `${init?.method ?? 'GET'} ${url}`;
      calls.push(call);
      if (init?.body) bodies.push(JSON.parse(String(init.body)));
      switch (call) {
        case 'GET /api/clock':
          return json(200, {
            now: new Date(stand.now).toISOString(),
            demoMode: stand.demoMode,
            standId: stand.standId,
            lastResetAt: stand.lastResetAt,
          });
        case 'POST /api/demo/clock': {
          if (stand.clockFails) {
            return json(400, {
              code: 'validation_failed',
              message: 'Проверьте поля формы',
              fields: { addSeconds: 'Не больше чем на год вперёд' },
            });
          }
          const { addSeconds } = JSON.parse(String(init?.body)) as { addSeconds: number };
          stand.now += addSeconds * 1000;
          return json(200, { now: new Date(stand.now).toISOString() });
        }
        case 'POST /api/demo/reset':
          if (stand.resetFails) {
            return json(500, {
              code: 'internal',
              message: 'Что-то пошло не так. Попробуйте ещё раз',
            });
          }
          stand.lastResetAt = new Date(stand.now).toISOString();
          signedIn = false;
          return json(200, { lastResetAt: stand.lastResetAt });
        case 'GET /api/me':
          return signedIn
            ? json(200, { id: 'u1', role: 'user', name: 'Анна', email: 'anna@demo' })
            : json(401, { code: 'unauthorized', message: 'Войдите, чтобы продолжить' });
        case 'GET /api/events/e1':
          if (stand.eventFails)
            return json(502, { code: 'internal', message: 'Что-то пошло не так' });
          // Карточка целиком: страница мероприятия — экран карточки
          return json(200, {
            id: 'e1',
            title: 'Футбол',
            description: 'Играем на поле у школы',
            sport: { id: 's1', name: 'Футбол', category: 'team', isCustom: false },
            organizer: { kind: 'user', id: 'u2', name: 'Игорь' },
            startsAt: '2026-10-19T06:00:00Z',
            endsAt: eventEndsAt,
            previousStartsAt: null,
            city: 'Красноярск',
            area: 'Центральный',
            placeText: 'Поле у школы',
            mode: 'free',
            applyQuestion: null,
            level: 'any',
            status: 'published',
            statusReason: null,
            displayStatus: 'open',
            participation: null,
            participationReason: null,
            participantInfo: null,
            actions: [],
          });
        default:
          return json(404, { code: 'not_found', message: 'Не найдено' });
      }
    }),
  );
  return { calls, bodies, stand };
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

const panel = () => screen.findByRole('region', { name: 'Демо-панель' });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('демо-панель (ТЗ 4.6)', () => {
  it('вне демо-режима панели нет', async () => {
    fakeStand({ demoMode: false });
    renderAt('/');
    await screen.findByRole('navigation', { name: 'Основные разделы' });
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Демо-панель' })).toBeNull());
  });

  it('показывает номер стенда, время последнего сброса и время стенда по Красноярску', async () => {
    fakeStand();
    renderAt('/');
    const region = await panel();
    expect(within(region).getByText(/Стенд stand-2/)).toBeTruthy();
    expect(within(region).getByText(/Сброс: 19 октября, 11:00/)).toBeTruthy();
    expect(within(region).getByText(/Время стенда: 19 октября, 12:00/)).toBeTruthy();
  });

  it('если сброса ещё не было — так и написано', async () => {
    fakeStand({ lastResetAt: null, standId: null });
    renderAt('/');
    const region = await panel();
    expect(within(region).getByText(/Сброса ещё не было/)).toBeTruthy();
  });

  it('«+1 час» и «+1 день» двигают часы стенда и обновляют время на экране', async () => {
    const { bodies } = fakeStand();
    const user = userEvent.setup();
    renderAt('/');
    const region = await panel();
    await user.click(within(region).getByRole('button', { name: '+1 час' }));
    await within(region).findByText(/Время стенда: 19 октября, 13:00/);
    await user.click(within(region).getByRole('button', { name: '+1 день' }));
    await within(region).findByText(/Время стенда: 20 октября, 13:00/);
    expect(bodies).toEqual([{ addSeconds: 3_600 }, { addSeconds: 86_400 }]);
  });

  it('сброс — только после подтверждения; «Отмена» ничего не стирает', async () => {
    const { calls } = fakeStand();
    const user = userEvent.setup();
    renderAt('/');
    const region = await panel();
    await user.click(within(region).getByRole('button', { name: 'Сбросить демо-данные' }));
    expect(calls).not.toContain('POST /api/demo/reset');
    await user.click(within(region).getByRole('button', { name: 'Отмена' }));
    expect(within(region).queryByRole('button', { name: 'Да, сбросить' })).toBeNull();
    expect(calls).not.toContain('POST /api/demo/reset');
  });

  it('после подтверждения сброса — новое время сброса, вход нужно повторить', async () => {
    const { calls } = fakeStand();
    const user = userEvent.setup();
    renderAt('/');
    const region = await panel();
    await screen.findByText('Сменить аккаунт');
    await user.click(within(region).getByRole('button', { name: 'Сбросить демо-данные' }));
    await user.click(within(region).getByRole('button', { name: 'Да, сбросить' }));
    await within(region).findByText(/Сброс: 19 октября, 12:00/);
    expect(calls).toContain('POST /api/demo/reset');
    await screen.findByRole('link', { name: 'Войти' });
  });

  it('сброс не удался — сообщение об ошибке, данные и вход прежние', async () => {
    fakeStand({ resetFails: true });
    const user = userEvent.setup();
    renderAt('/');
    const region = await panel();
    await screen.findByText('Сменить аккаунт');
    await user.click(within(region).getByRole('button', { name: 'Сбросить демо-данные' }));
    await user.click(within(region).getByRole('button', { name: 'Да, сбросить' }));
    expect((await within(region).findByRole('alert')).textContent).toMatch(
      /Не удалось сбросить демо-данные/,
    );
    expect(within(region).getByText(/Сброс: 19 октября, 11:00/)).toBeTruthy();
    expect(screen.getByText('Сменить аккаунт')).toBeTruthy();
  });

  it('на экране входа панель тоже есть: сброс доступен до входа', async () => {
    fakeStand();
    renderAt('/login');
    const region = await panel();
    expect(within(region).getByRole('button', { name: 'Сбросить демо-данные' })).toBeTruthy();
  });

  it('на странице мероприятия «Завершить это событие» переводит часы за его окончание', async () => {
    const { bodies } = fakeStand();
    const user = userEvent.setup();
    renderAt('/events/e1');
    const region = await panel();
    const finish = await within(region).findByRole('button', { name: 'Завершить это событие' });
    await user.click(finish);
    // Окончание в 07:30 UTC, на стенде 05:00:30 UTC: 2 ч 29,5 мин и ещё минута
    await waitFor(() => expect(bodies).toEqual([{ addSeconds: 9_030 }]));
  });

  it('завершившееся мероприятие завершить нельзя — с объяснением', async () => {
    fakeStand({}, '2026-10-19T04:30:00Z');
    renderAt('/events/e1');
    const region = await panel();
    const finish = await within(region).findByRole('button', { name: 'Завершить это событие' });
    expect((finish as HTMLButtonElement).disabled).toBe(true);
    expect(within(region).getByText('Мероприятие уже завершилось')).toBeTruthy();
  });

  it('вне страницы мероприятия кнопки «Завершить это событие» нет', async () => {
    fakeStand();
    renderAt('/');
    const region = await panel();
    expect(within(region).queryByRole('button', { name: 'Завершить это событие' })).toBeNull();
  });
});

describe('демо-панель: ошибки, фокус, мобильный экран', () => {
  it('перемотка отклонена — видна причина из поля, а не общий текст', async () => {
    fakeStand({ clockFails: true });
    const user = userEvent.setup();
    renderAt('/');
    const region = await panel();
    await user.click(within(region).getByRole('button', { name: '+1 час' }));
    expect((await within(region).findByRole('alert')).textContent).toBe(
      'Не удалось перевести часы: Не больше чем на год вперёд',
    );
  });

  it('«Завершить это событие» отклонено — сообщение тоже видно', async () => {
    fakeStand({ clockFails: true });
    const user = userEvent.setup();
    renderAt('/events/e1');
    const region = await panel();
    await user.click(await within(region).findByRole('button', { name: 'Завершить это событие' }));
    expect((await within(region).findByRole('alert')).textContent).toMatch(
      /Не удалось перевести часы: Не больше чем на год вперёд/,
    );
  });

  it('мероприятие не загрузилось — сказано, почему нет «Завершить это событие»', async () => {
    fakeStand({ eventFails: true });
    renderAt('/events/e1');
    const region = await panel();
    expect(await within(region).findByText(/Не удалось загрузить мероприятие/)).toBeTruthy();
    expect(within(region).queryByRole('button', { name: 'Завершить это событие' })).toBeNull();
  });

  it('фокус: подтверждение — на «Отмена», после отмены и после сброса — на «Сбросить демо-данные»', async () => {
    fakeStand();
    const user = userEvent.setup();
    renderAt('/');
    const region = await panel();
    await user.click(within(region).getByRole('button', { name: 'Сбросить демо-данные' }));
    expect(document.activeElement).toBe(within(region).getByRole('button', { name: 'Отмена' }));
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(
      within(region).getByRole('button', { name: 'Сбросить демо-данные' }),
    );

    await user.keyboard('{Enter}');
    await user.click(within(region).getByRole('button', { name: 'Да, сбросить' }));
    await within(region).findByText(/Сброс: 19 октября, 12:00/);
    expect(document.activeElement).toBe(
      within(region).getByRole('button', { name: 'Сбросить демо-данные' }),
    );
  });

  it('на мобильном инструменты свёрнуты под кнопкой «Инструменты» с aria-expanded', async () => {
    fakeStand();
    const user = userEvent.setup();
    renderAt('/');
    const region = await panel();
    expect(within(region).getByText('Демо · stand-2 · 12:00')).toBeTruthy();
    const toggle = within(region).getByRole('button', { name: 'Инструменты' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(region.hasAttribute('data-open')).toBe(true);
    const tools = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
    expect(tools && within(tools).getByRole('button', { name: '+1 час' })).toBeTruthy();
  });
});
