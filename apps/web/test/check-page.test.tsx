import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, AppRoutes, createQueryClient } from '../src/App';
import { CHECK_ROUTES } from '../src/features/check';

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function fakeStand(
  standId: string | null = 'stand-2',
  { demoMode = true, demoLogin = 'ok' }: { demoMode?: boolean; demoLogin?: 'ok' | 'missing' } = {},
) {
  let me: unknown = null;
  const calls: { call: string; body?: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = `${init?.method ?? 'GET'} ${url}`;
      calls.push({ call, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      switch (call) {
        case 'GET /api/clock':
          return json(200, {
            now: '2026-10-19T05:00:00Z',
            demoMode,
            standId,
            lastResetAt: null,
          });
        case 'GET /api/me':
          return me ? json(200, me) : json(401, { code: 'unauthorized', message: 'Войдите' });
        case 'POST /api/auth/demo-login': {
          if (demoLogin === 'missing') {
            return json(404, {
              code: 'demo_account_missing',
              message: 'Демо-аккаунта нет в базе — сбросьте демо-данные',
            });
          }
          const { account } = JSON.parse(String(init?.body)) as { account: string };
          me = { id: 'u', role: 'user', name: account, email: `${account}@demo` };
          return json(200, me);
        }
        default:
          return json(404, { code: 'not_found', message: 'Не найдено' });
      }
    }),
  );
  return { calls };
}

function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.pathname + location.search}</output>;
}

function renderAt(path: string) {
  return render(
    <AppProviders client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
        <Where />
      </MemoryRouter>
    </AppProviders>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('страница /check «Как проверить» (ТЗ 4.6)', () => {
  it('в данных — сценарии 1–6 и проверки P1 3.1, 3.2, 3.3, 3.5', () => {
    expect(CHECK_ROUTES.map((route) => route.id)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '3.1',
      '3.2',
      '3.3',
      '3.5',
    ]);
    for (const route of CHECK_ROUTES) {
      expect(route.steps.length, route.id).toBeGreaterThan(0);
      for (const step of route.steps) {
        expect(step.action, route.id).toMatch(/[А-Яа-яЁё]/);
        expect(step.expected, route.id).toMatch(/[А-Яа-яЁё]/);
      }
    }
  });

  it('каждый маршрут — схема «роль → действие → ожидаемый результат»', async () => {
    fakeStand();
    renderAt('/check');
    const scenario = await screen.findByRole('region', { name: /Сценарий 3/ });
    const first = within(scenario).getAllByRole('listitem')[0];
    expect(first?.textContent).toMatch(
      /Анна.*Открывает «Блиц-турнир в клубе «Ладья»».*«Записаться»/s,
    );
    expect(screen.getAllByRole('region', { name: /^(Сценарий|Проверка)/ })).toHaveLength(10);
  });

  it('первым шагом напоминает сбросить демо-данные', async () => {
    fakeStand();
    renderAt('/check');
    expect(await screen.findByText(/Перед каждым сценарием — «Сбросить демо-данные»/)).toBeTruthy();
  });

  it('кнопка входа под демо-аккаунтом входит и открывает нужный экран', async () => {
    const { calls } = fakeStand();
    const user = userEvent.setup();
    renderAt('/check');
    const scenario = await screen.findByRole('region', { name: /Сценарий 1/ });
    const [signIn] = await within(scenario).findAllByRole('button', { name: 'Войти как Анна' });
    if (!signIn) throw new Error('нет кнопки входа');
    await user.click(signIn);
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/create'));
    expect(calls).toContainEqual({ call: 'POST /api/auth/demo-login', body: { account: 'anna' } });
  });

  it('демо-вход не удался — причина рядом с кнопкой, а не тишина', async () => {
    fakeStand('stand-2', { demoLogin: 'missing' });
    renderAt('/check');
    const [button] = await screen.findAllByRole('button', { name: /^Войти как/ });
    await userEvent.click(button as HTMLElement);
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Демо-аккаунта нет в базе — сбросьте демо-данные',
    );
    expect(screen.getByTestId('where').textContent).toBe('/check');
  });

  it('вне демо-режима демо-почт и пароля на странице нет', async () => {
    fakeStand(null, { demoMode: false });
    renderAt('/check');
    await screen.findByText(/Сценарии проходят на демо-стенде/);
    expect(screen.queryByText(/anna@demo/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Войти как/ })).toBeNull();
  });

  it('фоновому участнику — почта и пароль: быстрого входа у него нет', async () => {
    fakeStand();
    renderAt('/check');
    const scenario = await screen.findByRole('region', { name: /Сценарий 4/ });
    expect(await within(scenario).findByText(/ksenia@demo, пароль demo/)).toBeTruthy();
    expect(within(scenario).queryByRole('button', { name: /Войти как Ксения/ })).toBeNull();
  });

  it('список стендов — по адресу этой страницы, текущий отмечен', async () => {
    fakeStand('stand-2');
    renderAt('/check');
    const stands = await screen.findByRole('region', { name: 'Стенды' });
    await within(stands).findByText(/stand-2.*вы здесь/);
    const links = within(stands).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      `http://${window.location.hostname}:8081/check`,
      `http://${window.location.hostname}:8082/check`,
      `http://${window.location.hostname}:8083/check`,
    ]);
    expect(within(stands).getByText(/stand-2.*вы здесь/)).toBeTruthy();
  });

  it('ссылка на docs/scenarios.md открывает сам документ', async () => {
    fakeStand();
    const user = userEvent.setup();
    renderAt('/check');
    await user.click(await screen.findByRole('link', { name: /docs\/scenarios\.md/ }));
    expect(await screen.findByText(/Сценарий 6\. Снятие с публикации/)).toBeTruthy();
    expect(screen.getByTestId('where').textContent).toBe('/check/scenarios');
  });

  it('в демо-панели — ссылка «Как проверить» на эту страницу', async () => {
    fakeStand();
    renderAt('/');
    const panel = await screen.findByRole('region', { name: 'Демо-панель' });
    expect(within(panel).getByRole('link', { name: 'Как проверить' }).getAttribute('href')).toBe(
      '/check',
    );
  });
});

describe('маршруты /check — проверки ТЗ 4.7 не теряются', () => {
  const route = (id: string) => CHECK_ROUTES.find((item) => item.id === id);

  it('сценарий 2: Анна видит страницу «Падел-клуба» с его событием', () => {
    const step = route('2')?.steps.find(
      (item) => 'account' in item.who && item.who.account === 'anna',
    );
    expect(step?.expected).toMatch(/Падел-клуба Енисей/);
  });

  it('сценарий 2: степпер организации и шаг «Решение» — на экране своей организации', () => {
    const steps = (route('2')?.steps ?? []).filter(
      (item) => 'account' in item.who && ['padel', 'stolby'].includes(item.who.account),
    );
    expect(steps.map((item) => item.path)).toEqual(['/organization', '/create', '/organization']);
  });

  it('«Открыть экран» ведёт туда, где есть мероприятие шага', () => {
    // Игорь — организатор «Футбола»: в его «Моих записях» события нет, а в ленте есть
    const reschedule = route('3.3')?.steps.find(
      (item) => 'account' in item.who && item.who.account === 'igor',
    );
    expect(reschedule?.path).toBe('/');
    // Снятого «Блица» в ленте нет — «Ладья» находит его через уведомление
    const ladya = route('6')?.steps.find(
      (item) => 'account' in item.who && item.who.account === 'ladya',
    );
    expect(ladya?.path).toBe('/notifications');
  });

  it('сценарий 6: «Ладья» видит баннер, а запись по прямой ссылке API отклоняет', () => {
    const steps = route('6')?.steps ?? [];
    expect(
      steps.find((item) => 'account' in item.who && item.who.account === 'ladya')?.expected,
    ).toMatch(/баннер/i);
    expect(steps.some((item) => /409/.test(item.expected))).toBe(true);
  });
});
