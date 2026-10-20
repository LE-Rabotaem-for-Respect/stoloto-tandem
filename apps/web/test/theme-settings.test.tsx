import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, AppRoutes, createQueryClient } from '../src/App';
import { savedTheme } from '../src/features/auth';

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const anna = (settings: unknown = {}) => ({
  id: 'u1',
  role: 'user',
  name: 'Анна',
  email: 'anna@demo',
  city: null,
  bio: null,
  settings,
  organization: null,
});

/** Api в памяти: профиль, вход и сохранение настроек оформления. */
function fakeApi({ signedIn = false, settings = {} as unknown, saveFails = false } = {}) {
  let me = signedIn ? anna(settings) : null;
  const saved: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = `${init?.method ?? 'GET'} ${new URL(url, 'http://stand').pathname}`;
      switch (call) {
        case 'GET /api/me':
          return me ? json(200, me) : json(401, { code: 'unauthorized', message: 'Войдите' });
        case 'GET /api/clock':
          return json(200, {
            now: '2026-10-19T12:00:00Z',
            demoMode: false,
            standId: null,
            lastResetAt: null,
          });
        case 'POST /api/auth/login':
          me = anna(settings);
          return json(200, me);
        case 'PATCH /api/me/settings': {
          const patch = JSON.parse(String(init?.body)) as object;
          saved.push(patch);
          if (saveFails) return json(500, { code: 'internal', message: 'Ошибка' });
          return json(200, anna({ theme: patch }));
        }
        case 'GET /api/events':
          return json(200, { items: [], total: 0, limit: 20, offset: 0 });
        default:
          return json(404, { code: 'not_found', message: 'Не найдено' });
      }
    }),
  );
  return { saved };
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

const root = () => document.documentElement;

beforeEach(() => {
  localStorage.clear();
  delete root().dataset.theme;
  delete root().dataset.text;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('оформление, сохранённое в аккаунте', () => {
  it('читает только известные настройки и только да/нет', () => {
    expect(savedTheme({ theme: { largeText: true, contrast: false } })).toEqual({
      largeText: true,
      contrast: false,
    });
    expect(savedTheme({ theme: { largeText: 'да', contrast: true, extra: 1 } })).toEqual({
      contrast: true,
    });
    expect(savedTheme(null)).toEqual({});
    expect(savedTheme({ theme: [] })).toEqual({});
    expect(savedTheme('строка')).toEqual({});
  });
});

describe('переключатели «Крупный текст» и «Высокий контраст»', { timeout: 15_000 }, () => {
  it('у вошедшего выбор в шапке сохраняется в аккаунт', async () => {
    const { saved } = fakeApi({ signedIn: true });
    const user = userEvent.setup();
    renderApp('/');

    await screen.findByRole('button', { name: 'Сменить аккаунт' });
    await user.click(screen.getByRole('button', { name: /Крупный текст/ }));
    expect(root().dataset.text).toBe('large');
    await waitFor(() => expect(saved).toEqual([{ largeText: true }]));
    expect(JSON.parse(localStorage.getItem('tandem-theme') ?? '{}')).toMatchObject({
      largeText: true,
    });
  });

  it('у гостя выбор остаётся в браузере, в аккаунт ничего не уходит', async () => {
    const { saved } = fakeApi();
    const user = userEvent.setup();
    renderApp('/');

    await user.click(await screen.findByRole('button', { name: /Контраст/ }));
    expect(root().dataset.theme).toBe('contrast');
    expect(JSON.parse(localStorage.getItem('tandem-theme') ?? '{}')).toMatchObject({
      contrast: true,
    });
    expect(saved).toEqual([]);
  });

  it('после входа применяется оформление из аккаунта', async () => {
    fakeApi({ settings: { theme: { contrast: true } } });
    const user = userEvent.setup();
    renderApp('/login');

    expect(root().dataset.theme).toBe('default');
    await user.type(await screen.findByLabelText('Почта'), 'anna@demo');
    await user.type(screen.getByLabelText('Пароль'), 'demo');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    await waitFor(() => expect(root().dataset.theme).toBe('contrast'));
    // «Крупный текст» в аккаунте не задан — остаётся выбор браузера
    expect(root().dataset.text).toBe('normal');
  });

  it('своё сохранение не откатывает выбор: переключить можно и обратно', async () => {
    const { saved } = fakeApi({ signedIn: true, settings: { theme: { largeText: true } } });
    const user = userEvent.setup();
    renderApp('/');

    await waitFor(() => expect(root().dataset.text).toBe('large'));
    await user.click(screen.getByRole('button', { name: /Крупный текст/ }));
    await waitFor(() => expect(saved).toEqual([{ largeText: false }]));
    expect(root().dataset.text).toBe('normal');
  });

  it('в профиле — «Оформление» с теми же переключателями', async () => {
    const { saved } = fakeApi({ signedIn: true });
    const user = userEvent.setup();
    renderApp('/profile');

    const section = await screen.findByRole('region', { name: 'Оформление' });
    const contrast = section.querySelector('button:nth-of-type(2)') as HTMLButtonElement;
    expect(contrast.textContent).toBe('Высокий контраст');
    expect(contrast.getAttribute('aria-pressed')).toBe('false');
    await user.click(contrast);
    expect(contrast.getAttribute('aria-pressed')).toBe('true');
    expect(root().dataset.theme).toBe('contrast');
    // Шапка показывает то же состояние
    expect(screen.getByRole('button', { name: /^Контраст$/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    await waitFor(() => expect(saved).toEqual([{ contrast: true }]));
  });

  it('сбой сохранения в аккаунт не откатывает выбор', async () => {
    const { saved } = fakeApi({
      signedIn: true,
      settings: { theme: { largeText: true } },
      saveFails: true,
    });
    const user = userEvent.setup();
    renderApp('/');

    await waitFor(() => expect(root().dataset.text).toBe('large'));
    await user.click(screen.getByRole('button', { name: /Крупный текст/ }));
    await waitFor(() => expect(saved).toEqual([{ largeText: false }]));
    // Ответ с ошибкой пришёл, а оформление из аккаунта повторно не применилось
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(root().dataset.text).toBe('normal');
    expect(JSON.parse(localStorage.getItem('tandem-theme') ?? '{}')).toMatchObject({
      largeText: false,
    });
  });
});
