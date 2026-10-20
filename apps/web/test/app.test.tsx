import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router';
import type { InitialEntry } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, AppRoutes, createQueryClient } from '../src/App';
import { useAuthAction } from '../src/features/auth';
import { takePendingAction } from '../src/features/auth/pending-action';
import { AppLayout } from '../src/features/navigation/AppLayout';
import { LoginPage, RegisterPage } from '../src/pages/pages';

interface Me {
  id: string;
  role: 'user' | 'org' | 'admin';
  name: string;
  email: string;
  organization: { id: string; name: string; status: string } | null;
}

const anna: Me = { id: 'u1', role: 'user', name: 'Анна', email: 'anna@demo', organization: null };
const igor: Me = { id: 'u2', role: 'user', name: 'Игорь', email: 'igor@demo', organization: null };

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** Небольшой api в памяти: вход, выход, профиль, режим стенда. */
function fakeApi({ demoMode = false, signedIn = null as Me | null, meDown = false } = {}) {
  let me = signedIn;
  const calls: string[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const call = `${init?.method ?? 'GET'} ${url}`;
    calls.push(call);
    switch (call) {
      case 'GET /api/me':
        if (meDown) return json(502, { code: 'internal', message: 'Что-то пошло не так' });
        return me ? json(200, me) : json(401, { code: 'unauthorized', message: 'Войдите' });
      case 'GET /api/clock':
        return json(200, {
          now: '2026-10-19T12:00:00Z',
          demoMode,
          standId: null,
          lastResetAt: null,
        });
      case 'POST /api/auth/login': {
        const body = JSON.parse(String(init?.body)) as { email: string; password: string };
        if (body.password !== 'demo') {
          return json(401, { code: 'invalid_credentials', message: 'Неверная почта или пароль' });
        }
        me = body.email === igor.email ? igor : anna;
        return json(200, me);
      }
      case 'POST /api/auth/demo-login':
        me = anna;
        return json(200, me);
      case 'POST /api/auth/logout':
        me = null;
        return json(204);
      default:
        return json(404, { code: 'not_found', message: 'Не найдено' });
    }
  });
  vi.stubGlobal('fetch', fetchMock);
  // Сменить пользователя на сервере без входа и выхода — как вход в другой вкладке
  const setMe = (next: Me | null) => {
    me = next;
  };
  return { calls, setMe };
}

function renderApp(
  path: string | InitialEntry[],
  routes = <AppRoutes />,
  client = createQueryClient(),
) {
  const entries = typeof path === 'string' ? [path] : path;
  return render(
    <AppProviders client={client}>
      <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
        {routes}
      </MemoryRouter>
    </AppProviders>,
  );
}

beforeEach(() => {
  joinVisible = true;
  localStorage.clear();
  sessionStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.text;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('каркас приложения', () => {
  it('гость видит ленту, навигацию из пяти пунктов и «Войти»', async () => {
    fakeApi();
    renderApp('/');
    expect(screen.getByRole('heading', { name: 'Найти занятие' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Тандем' }).getAttribute('href')).toBe('/');
    const nav = screen.getByRole('navigation', { name: 'Основные разделы' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Найти', 'Мои записи', 'Создать', 'Уведомления', 'Профиль']);
    expect(await screen.findByRole('link', { name: 'Войти' })).toBeTruthy();
  });

  it('раздел для вошедших: гость попадает на вход и после входа возвращается туда же', async () => {
    fakeApi();
    renderApp('/my');
    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeTruthy();

    await userEvent.type(screen.getByLabelText('Почта'), 'anna@demo');
    await userEvent.type(screen.getByLabelText('Пароль'), 'demo');
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }));

    expect(await screen.findByRole('heading', { name: 'Мои записи' })).toBeTruthy();
    expect(screen.getByText('Анна')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Сменить аккаунт' })).toBeTruthy();
  });

  it('в шапке — имя организации, полное имя в подсказке (на узком экране оно обрезается многоточием)', async () => {
    const ladya: Me = {
      ...anna,
      role: 'org',
      organization: { id: 'o1', name: 'Шахматный клуб «Ладья»', status: 'approved' },
    };
    fakeApi({ signedIn: ladya });
    renderApp('/');
    const name = await screen.findByText('Шахматный клуб «Ладья»');
    expect(name.closest('.account-name')?.getAttribute('title')).toBe('Шахматный клуб «Ладья»');
  });

  it('«Войти» на экране регистрации сохраняет адрес возврата, вошедшего форма не держит', async () => {
    fakeApi();
    renderApp('/register?next=%2Fmy');
    const link = await screen.findByRole('link', { name: 'Войти' });
    expect(link.getAttribute('href')).toBe('/login?next=%2Fmy');

    cleanup();
    fakeApi({ signedIn: anna });
    renderApp('/login?next=%2Fmy');
    expect(await screen.findByRole('heading', { name: 'Мои записи' })).toBeTruthy();
  });

  it('сбой /me — ошибка с повтором, а не уход на вход', async () => {
    fakeApi({ meDown: true });
    renderApp('/my');
    expect((await screen.findByRole('alert')).textContent).toContain('Не удалось проверить вход');
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Нет связи — повторить' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Вход' })).toBeNull();
  });

  it('неверный пароль — сообщение, вход не выполнен', async () => {
    fakeApi();
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Почта'), 'anna@demo');
    await userEvent.type(screen.getByLabelText('Пароль'), 'не тот');
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Неверная почта или пароль');
    expect(screen.getByRole('heading', { name: 'Вход' })).toBeTruthy();
  });

  it('«Быстрый вход для проверки» — только на демо-стенде', async () => {
    fakeApi({ demoMode: false });
    const { unmount } = renderApp('/login');
    await screen.findByRole('heading', { name: 'Вход' });
    await waitFor(() => expect(screen.queryByText('Быстрый вход для проверки')).toBeNull());
    unmount();
    vi.unstubAllGlobals();

    fakeApi({ demoMode: true });
    renderApp('/login?next=%2Fprofile');
    const block = await screen.findByRole('region', { name: 'Быстрый вход для проверки' });
    const buttons = within(block).getAllByRole('button');
    expect(buttons).toHaveLength(8);
    await userEvent.click(within(block).getByRole('button', { name: /Анна/ }));
    expect(await screen.findByRole('heading', { name: 'Профиль' })).toBeTruthy();
    expect(screen.getByText('anna@demo')).toBeTruthy();
  });

  it('«Сменить аккаунт» — выход и экран входа с возвратом на текущую страницу', async () => {
    const api = fakeApi({ signedIn: anna });
    renderApp('/profile');
    await userEvent.click(await screen.findByRole('button', { name: 'Сменить аккаунт' }));
    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeTruthy();
    expect(api.calls).toContain('POST /api/auth/logout');
    expect(await screen.findByRole('link', { name: 'Войти' })).toBeTruthy();
  });

  it('темы «Крупный текст» и «Контраст» включаются независимо и запоминаются', async () => {
    fakeApi();
    renderApp('/');
    const contrast = screen.getByRole('button', { name: 'Контраст' });
    const large = screen.getByRole('button', { name: /Крупный текст/ });

    await userEvent.click(contrast);
    expect(document.documentElement.dataset.theme).toBe('contrast');
    expect(document.documentElement.dataset.text).toBe('normal');
    expect(contrast.getAttribute('aria-pressed')).toBe('true');

    await userEvent.click(large);
    expect(document.documentElement.dataset.text).toBe('large');
    expect(JSON.parse(localStorage.getItem('tandem-theme') ?? '{}')).toEqual({
      largeText: true,
      contrast: true,
    });
  });
});

function BackButton() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => void navigate(-1)}>
      Назад
    </button>
  );
}

// Кнопку страница показывает не всегда: роль вошедшего, загрузка, уже записан
let joinVisible = true;

function MaybeJoin({ onJoin }: { onJoin(): void }) {
  return joinVisible ? <JoinButton onJoin={onJoin} /> : <p>Кнопки нет</p>;
}

// state экрана входа — чтобы тест вернул ту же запись истории, что осталась бы в браузере
let loginState: unknown = null;
const rememberLoginState = (state: unknown) => {
  loginState = state;
};
function RememberState() {
  const { state } = useLocation();
  useEffect(() => rememberLoginState(state), [state]);
  return null;
}

function ReplayLogin() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => void navigate('/events/1', { state: loginState })}>
      Повторить запись входа
    </button>
  );
}

function JoinButton({ onJoin }: { onJoin(): void }) {
  const join = useAuthAction('join', onJoin);
  return (
    <button type="button" onClick={join}>
      Записаться
    </button>
  );
}

describe('действие гостя', () => {
  it('ведёт на вход, а после входа то же действие выполняется само', async () => {
    fakeApi();
    const onJoin = vi.fn();
    renderApp(
      '/events/1',
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="events/:id" element={<JoinButton onJoin={onJoin} />} />
          <Route path="login" element={<LoginPage />} />
        </Route>
      </Routes>,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Записаться' }));
    expect(onJoin).not.toHaveBeenCalled();
    await userEvent.type(await screen.findByLabelText('Почта'), 'anna@demo');
    await userEvent.type(screen.getByLabelText('Пароль'), 'demo');
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }));

    await screen.findByRole('button', { name: 'Записаться' });
    await waitFor(() => expect(onJoin).toHaveBeenCalledTimes(1));
  });

  it('ссылка с ?intent= у вошедшего ничего не делает сама', async () => {
    fakeApi({ signedIn: anna });
    const onJoin = vi.fn();
    renderApp(
      '/events/1?intent=join',
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="events/:id" element={<JoinButton onJoin={onJoin} />} />
        </Route>
      </Routes>,
    );
    await screen.findByRole('button', { name: 'Сменить аккаунт' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onJoin).not.toHaveBeenCalled();
  });

  it('брошенный вход позже ничего не делает сам', async () => {
    fakeApi();
    const onJoin = vi.fn();
    renderApp(
      '/events/1',
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="events/:id" element={<JoinButton onJoin={onJoin} />} />
          <Route
            path="login"
            element={
              <>
                <BackButton />
                <LoginPage />
              </>
            }
          />
        </Route>
      </Routes>,
    );

    // Гость нажал «Записаться», на экране входа передумал и вернулся назад
    await userEvent.click(await screen.findByRole('button', { name: 'Записаться' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Назад' }));
    // Позже вошёл через шапку и вернулся на ту же страницу
    await userEvent.click(await screen.findByRole('link', { name: 'Войти' }));
    await userEvent.type(await screen.findByLabelText('Почта'), 'anna@demo');
    await userEvent.type(screen.getByLabelText('Пароль'), 'demo');
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }));

    await screen.findByRole('button', { name: 'Записаться' });
    await screen.findByRole('button', { name: 'Сменить аккаунт' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onJoin).not.toHaveBeenCalled();
  });

  it('действие переживает переход со входа на регистрацию и обратно', async () => {
    fakeApi();
    const onJoin = vi.fn();
    renderApp(
      '/events/1',
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="events/:id" element={<JoinButton onJoin={onJoin} />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
        </Route>
      </Routes>,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Записаться' }));
    await userEvent.click(await screen.findByRole('link', { name: 'Зарегистрироваться' }));
    await screen.findByRole('heading', { name: 'Регистрация' });
    const main = screen.getByRole('main');
    await userEvent.click(within(main).getByRole('link', { name: 'Войти' }));
    await userEvent.type(await screen.findByLabelText('Почта'), 'anna@demo');
    await userEvent.type(screen.getByLabelText('Пароль'), 'demo');
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }));

    await screen.findByRole('button', { name: 'Записаться' });
    await waitFor(() => expect(onJoin).toHaveBeenCalledTimes(1));
  });

  it('действие, не выполненное на странице без кнопки, позже не срабатывает', async () => {
    fakeApi();
    const onJoin = vi.fn();
    renderApp(
      '/events/1',
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<BackButton />} />
          <Route path="events/:id" element={<MaybeJoin onJoin={onJoin} />} />
          <Route path="login" element={<LoginPage />} />
        </Route>
      </Routes>,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Записаться' }));
    // После входа кнопки на странице нет — действие некому выполнить
    joinVisible = false;
    await userEvent.type(await screen.findByLabelText('Почта'), 'anna@demo');
    await userEvent.type(screen.getByLabelText('Пароль'), 'demo');
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }));
    await screen.findByText('Кнопки нет');

    // Человек ушёл на главную, кнопка появилась, он вернулся «Назад»
    await userEvent.click(screen.getByRole('link', { name: 'Тандем' }));
    joinVisible = true;
    await userEvent.click(await screen.findByRole('button', { name: 'Назад' }));
    await screen.findByRole('button', { name: 'Записаться' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onJoin).not.toHaveBeenCalled();
  });

  it('после смены аккаунта отложенное действие прежнего гостя не выполняется для другого', async () => {
    fakeApi();
    const onJoin = vi.fn();
    renderApp(
      '/events/1',
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="events/:id" element={<MaybeJoin onJoin={onJoin} />} />
          <Route
            path="login"
            element={
              <>
                <BackButton />
                <LoginPage />
              </>
            }
          />
        </Route>
      </Routes>,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Записаться' }));
    joinVisible = false;
    await userEvent.type(await screen.findByLabelText('Почта'), 'anna@demo');
    await userEvent.type(screen.getByLabelText('Пароль'), 'demo');
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }));
    await screen.findByText('Кнопки нет');

    // Другой человек: «Сменить аккаунт», вход, затем кнопка видна
    await userEvent.click(screen.getByRole('button', { name: 'Сменить аккаунт' }));
    await userEvent.type(await screen.findByLabelText('Почта'), 'igor@demo');
    await userEvent.type(screen.getByLabelText('Пароль'), 'demo');
    joinVisible = true;
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }));
    await screen.findByRole('button', { name: 'Записаться' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onJoin).not.toHaveBeenCalled();
  });

  it('две кнопки одного действия на странице выполняют его один раз', async () => {
    fakeApi();
    const onJoin = vi.fn();
    renderApp(
      '/events/1',
      <Routes>
        <Route element={<AppLayout />}>
          <Route
            path="events/:id"
            element={
              <>
                <JoinButton onJoin={onJoin} />
                <JoinButton onJoin={onJoin} />
              </>
            }
          />
          <Route path="login" element={<LoginPage />} />
        </Route>
      </Routes>,
    );

    const [firstJoin] = await screen.findAllByRole('button', { name: 'Записаться' });
    if (!firstJoin) throw new Error('кнопки «Записаться» нет');
    await userEvent.click(firstJoin);
    await userEvent.type(await screen.findByLabelText('Почта'), 'anna@demo');
    await userEvent.type(screen.getByLabelText('Пароль'), 'demo');
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }));

    await screen.findAllByRole('button', { name: 'Записаться' });
    await waitFor(() => expect(onJoin).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onJoin).toHaveBeenCalledTimes(1);
  });

  it('под StrictMode отложенное действие выполняется ровно один раз', async () => {
    fakeApi();
    const onJoin = vi.fn();
    render(
      <StrictMode>
        <AppProviders client={createQueryClient()}>
          <MemoryRouter initialEntries={['/events/1']}>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="events/:id" element={<JoinButton onJoin={onJoin} />} />
                <Route path="login" element={<LoginPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AppProviders>
      </StrictMode>,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Записаться' }));
    await userEvent.type(await screen.findByLabelText('Почта'), 'anna@demo');
    await userEvent.type(screen.getByLabelText('Пароль'), 'demo');
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }));

    await screen.findByRole('button', { name: 'Записаться' });
    await waitFor(() => expect(onJoin).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onJoin).toHaveBeenCalledTimes(1);
  });

  it('вошедший выполняет действие сразу', async () => {
    fakeApi({ signedIn: anna });
    const onJoin = vi.fn();
    renderApp(
      '/events/1',
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="events/:id" element={<JoinButton onJoin={onJoin} />} />
        </Route>
      </Routes>,
    );
    // Профиль загружен — шапка показывает, под кем вход
    await screen.findByRole('button', { name: 'Сменить аккаунт' });
    await userEvent.click(screen.getByRole('button', { name: 'Записаться' }));
    await waitFor(() => expect(onJoin).toHaveBeenCalledTimes(1));
  });
});

function JoinEvent({ id, onJoin }: { id: string; onJoin(id: string): void }) {
  const join = useAuthAction(`join:${id}`, () => onJoin(id));
  return (
    <button type="button" onClick={join}>
      Записаться на {id}
    </button>
  );
}

describe('несколько действий гостя на одной странице', () => {
  it('после входа выполняется только нажатое: intent у каждой кнопки свой', async () => {
    fakeApi();
    const onJoin = vi.fn();
    renderApp(
      '/events',
      <Routes>
        <Route element={<AppLayout />}>
          <Route
            path="events"
            element={
              <>
                <JoinEvent id="1" onJoin={onJoin} />
                <JoinEvent id="2" onJoin={onJoin} />
              </>
            }
          />
          <Route path="login" element={<LoginPage />} />
        </Route>
      </Routes>,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Записаться на 2' }));
    await userEvent.type(await screen.findByLabelText('Почта'), 'anna@demo');
    await userEvent.type(screen.getByLabelText('Пароль'), 'demo');
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }));

    await screen.findByRole('button', { name: 'Записаться на 1' });
    await waitFor(() => expect(onJoin).toHaveBeenCalledTimes(1));
    expect(onJoin).toHaveBeenCalledWith('2');
  });

  it('одинаковый intent у двух кнопок страницы — ошибка в консоли разработчика', async () => {
    fakeApi();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderApp(
      '/events/1',
      <Routes>
        <Route
          path="events/:id"
          element={
            <>
              <JoinButton onJoin={vi.fn()} />
              <JoinButton onJoin={vi.fn()} />
            </>
          }
        />
      </Routes>,
    );
    await screen.findAllByRole('button', { name: 'Записаться' });
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/intent «join».*уникальн/));
    error.mockRestore();
  });

  it('разные intent ошибок не дают', async () => {
    fakeApi();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderApp(
      '/events',
      <Routes>
        <Route
          path="events"
          element={
            <>
              <JoinEvent id="1" onJoin={vi.fn()} />
              <JoinEvent id="2" onJoin={vi.fn()} />
            </>
          }
        />
      </Routes>,
    );
    await screen.findByRole('button', { name: 'Записаться на 2' });
    expect(error).not.toHaveBeenCalledWith(expect.stringMatching(/intent/));
    error.mockRestore();
  });
});

describe('экран входа и прилипающая шапка', () => {
  it('«Войти» в шапке на экране входа ведёт на заданный next, а не на сам вход', async () => {
    fakeApi();
    renderApp('/login?next=%2Fmy');
    const link = await screen.findByRole('link', { name: 'Войти' });
    expect(link.getAttribute('href')).toBe('/login?next=%2Fmy');
  });

  it('фокус не прячется под шапкой: отступ прокрутки — по её фактической высоте', async () => {
    let notify: () => void = () => undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          notify = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    let height = 106;
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(() => ({ height }) as DOMRect);
    try {
      fakeApi();
      renderApp('/');
      await screen.findByRole('link', { name: 'Войти' });
      const root = document.documentElement.style;
      expect(root.getPropertyValue('--app-top-height')).toBe('106px');
      height = 204;
      notify();
      expect(root.getPropertyValue('--app-top-height')).toBe('204px');
    } finally {
      // Подмена прототипа не должна пережить упавший тест
      rect.mockRestore();
    }
  });
});

// После входа человек оказывается уже записан: вместо «Записаться» — «Отменить запись»
let memberAfterSignIn = false;

function MemberPage({ onJoin }: { onJoin(): void }) {
  const [cancelled, setCancelled] = useState(false);
  if (!memberAfterSignIn || cancelled) return <JoinButton onJoin={onJoin} />;
  return (
    <button type="button" onClick={() => setCancelled(true)}>
      Отменить запись
    </button>
  );
}

// Кнопка записи появляется позже сама, без действий человека: по сигналу теста
let reveal: () => void = () => undefined;

function RevealLater({ onJoin }: { onJoin(): void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    reveal = () => setVisible(true);
  });
  if (!memberAfterSignIn || visible) return <JoinButton onJoin={onJoin} />;
  return <p>Вы участник</p>;
}

// Кнопка записи появляется сама, когда «загрузились данные»
function JoinAfterLoad({ onJoin }: { onJoin(): void }) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setLoaded(true), 30);
    return () => clearTimeout(timer);
  }, []);
  return loaded ? <JoinButton onJoin={onJoin} /> : <p role="status">Загрузка…</p>;
}

describe('отложенное действие — только ответ на клик гостя', () => {
  const routes = (page: ReactNode) => (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="events/:id" element={page} />
        <Route
          path="login"
          element={
            <>
              <BackButton />
              <LoginPage />
            </>
          }
        />
        <Route path="register" element={<RegisterPage />} />
      </Route>
    </Routes>
  );

  async function signIn(email = 'anna@demo') {
    await userEvent.type(await screen.findByLabelText('Почта'), email);
    await userEvent.type(screen.getByLabelText('Пароль'), 'demo');
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }));
  }

  beforeEach(() => {
    memberAfterSignIn = false;
  });

  it('кнопка, которую страница показала после загрузки данных, выполняет действие', async () => {
    fakeApi();
    const onJoin = vi.fn();
    renderApp('/events/1', routes(<JoinAfterLoad onJoin={onJoin} />));
    await userEvent.click(await screen.findByRole('button', { name: 'Записаться' }));
    await signIn();
    await waitFor(() => expect(onJoin).toHaveBeenCalledTimes(1));
  });

  it('кнопка, появившаяся после действия самого человека, сама не срабатывает', async () => {
    fakeApi();
    const onJoin = vi.fn();
    renderApp('/events/1', routes(<MemberPage onJoin={onJoin} />));
    await userEvent.click(await screen.findByRole('button', { name: 'Записаться' }));
    memberAfterSignIn = true;
    await signIn();
    // Уже записан — кнопки нет; он отменил запись, «Записаться» снова на экране
    await userEvent.click(await screen.findByRole('button', { name: 'Отменить запись' }));
    await screen.findByRole('button', { name: 'Записаться' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onJoin).not.toHaveBeenCalled();
  });

  it('вход ↔ регистрация не оставляют экран входа в истории: «Назад» — к странице события', async () => {
    fakeApi();
    renderApp('/events/1', routes(<JoinButton onJoin={vi.fn()} />));
    await userEvent.click(await screen.findByRole('button', { name: 'Записаться' }));
    await userEvent.click(await screen.findByRole('link', { name: 'Зарегистрироваться' }));
    await userEvent.click(
      await within(screen.getByRole('main')).findByRole('link', { name: 'Войти' }),
    );
    await screen.findByLabelText('Почта');
    await userEvent.click(screen.getByRole('button', { name: 'Назад' }));
    await screen.findByRole('button', { name: 'Записаться' });
    expect(screen.queryByLabelText('Почта')).toBeNull();
  });

  it('оставленное действие не переживает размонтирование каркаса', async () => {
    fakeApi();
    const onJoin = vi.fn();
    renderApp('/events/1', routes(<MemberPage onJoin={onJoin} />));
    await userEvent.click(await screen.findByRole('button', { name: 'Записаться' }));
    memberAfterSignIn = true;
    await signIn();
    await screen.findByRole('button', { name: 'Отменить запись' });
    cleanup();
    // Действие осталось бы в памяти и сработало бы в следующем приложении или тесте
    expect(takePendingAction('/events/1', 'join', anna.id)).toBe(false);
    expect(onJoin).not.toHaveBeenCalled();
  });

  it('кнопка, появившаяся сама намного позже, действие не выполняет: у него есть срок', async () => {
    fakeApi();
    const onJoin = vi.fn();
    renderApp('/events/1', routes(<RevealLater onJoin={onJoin} />));
    await userEvent.click(await screen.findByRole('button', { name: 'Записаться' }));
    memberAfterSignIn = true;
    await signIn();
    await screen.findByText('Вы участник');

    // Человек ничего не нажимал, а через минуту страница сама показала «Записаться»
    // (запись отменили в другой вкладке, данные обновились)
    const later = performance.now() + 60_000;
    const now = vi.spyOn(performance, 'now').mockReturnValue(later);
    try {
      act(() => reveal());
      await screen.findByRole('button', { name: 'Записаться' });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(onJoin).not.toHaveBeenCalled();
    } finally {
      now.mockRestore();
    }
  });

  it('запись истории с действием, которого эта вкладка не выдавала, ничего не запускает', async () => {
    // Старая запись экрана входа с действием в state — как после «Сменить аккаунт» и «Назад»
    fakeApi();
    const onJoin = vi.fn();
    renderApp(
      [
        '/events/1',
        {
          pathname: '/login',
          search: '?next=%2Fevents%2F1',
          state: { pendingAction: { path: '/events/1', intent: 'join', token: 'old:1' } },
        },
      ],
      routes(<JoinButton onJoin={onJoin} />),
    );
    await signIn('igor@demo');
    await screen.findByRole('button', { name: 'Записаться' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onJoin).not.toHaveBeenCalled();
  });

  it('гость ушёл со входа по ссылке и вошёл позже: прежнее действие для другого не выполняется', async () => {
    fakeApi();
    const onJoin = vi.fn();
    renderApp(
      '/events/1',
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<BackButton />} />
          <Route path="events/:id" element={<JoinButton onJoin={onJoin} />} />
          <Route
            path="login"
            element={
              <>
                <BackButton />
                <LoginPage />
              </>
            }
          />
        </Route>
      </Routes>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Записаться' }));
    await screen.findByLabelText('Почта');
    // Ушёл по логотипу, позже вошёл через шапку — Анна
    await userEvent.click(screen.getByRole('link', { name: 'Тандем' }));
    await userEvent.click(await screen.findByRole('link', { name: 'Войти' }));
    await signIn('anna@demo');
    await screen.findByRole('button', { name: 'Сменить аккаунт' });
    // «Сменить аккаунт», затем «Назад», пока не вернётся старый экран входа с действием
    await userEvent.click(screen.getByRole('button', { name: 'Сменить аккаунт' }));
    for (let step = 0; step < 3; step += 1) {
      await userEvent.click(await screen.findByRole('button', { name: 'Назад' }));
    }
    await signIn('igor@demo');
    await screen.findByRole('button', { name: 'Сменить аккаунт' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onJoin).not.toHaveBeenCalled();
  });

  it('сменился пользователь на той же странице — действие прежнего не выполняется', async () => {
    const { setMe } = fakeApi();
    const client = createQueryClient();
    const onJoin = vi.fn();
    renderApp('/events/1', routes(<RevealLater onJoin={onJoin} />), client);
    await userEvent.click(await screen.findByRole('button', { name: 'Записаться' }));
    memberAfterSignIn = true;
    await signIn();
    await screen.findByText('Вы участник');

    // В другой вкладке вошёл Игорь: без навигации и без нажатий на этой странице
    setMe(igor);
    await act(() => client.invalidateQueries({ queryKey: ['me'] }));
    await screen.findByText('Игорь');
    act(() => reveal());
    await screen.findByRole('button', { name: 'Записаться' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onJoin).not.toHaveBeenCalled();
  });

  it('щелчок без нажатия указателя (диктор, голосовое управление) тоже выбрасывает действие', async () => {
    fakeApi();
    const onJoin = vi.fn();
    renderApp('/events/1', routes(<RevealLater onJoin={onJoin} />));
    await userEvent.click(await screen.findByRole('button', { name: 'Записаться' }));
    memberAfterSignIn = true;
    await signIn();
    await screen.findByText('Вы участник');
    fireEvent.click(document.body);
    act(() => reveal());
    await screen.findByRole('button', { name: 'Записаться' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onJoin).not.toHaveBeenCalled();
  });

  it('гость бросил вход, не войдя: «Назад» к этому входу и вход другого действие не запускает', async () => {
    fakeApi();
    const onJoin = vi.fn();
    renderApp(
      '/events/1',
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<BackButton />} />
          <Route path="events/:id" element={<JoinButton onJoin={onJoin} />} />
          <Route
            path="login"
            element={
              <>
                <BackButton />
                <LoginPage />
              </>
            }
          />
        </Route>
      </Routes>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Записаться' }));
    await screen.findByLabelText('Почта');
    // Ушёл по логотипу и отошёл; за компьютер сел другой и вернулся «Назад» к тому входу
    await userEvent.click(screen.getByRole('link', { name: 'Тандем' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Назад' }));
    await signIn('igor@demo');
    await screen.findByRole('button', { name: 'Сменить аккаунт' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onJoin).not.toHaveBeenCalled();
  });

  it('номер действия не повторяется в новой загрузке страницы: старые записи входа не совпадут', async () => {
    const tokenOfNewLoad = async () => {
      vi.resetModules();
      const { issuePendingAction } = await import('../src/features/auth/pending-action');
      return issuePendingAction('/events/1', 'join').token;
    };
    const first = await tokenOfNewLoad();
    const second = await tokenOfNewLoad();
    expect(second).not.toBe(first);
  });

  it('выполненное действие номер тратит: та же запись входа второй раз ничего не запускает', async () => {
    fakeApi();
    const onJoin = vi.fn();
    renderApp(
      '/events/1',
      <Routes>
        <Route element={<AppLayout />}>
          <Route
            path="events/:id"
            element={
              <>
                <JoinButton onJoin={onJoin} />
                <ReplayLogin />
              </>
            }
          />
          <Route
            path="login"
            element={
              <>
                <RememberState />
                <LoginPage />
              </>
            }
          />
        </Route>
      </Routes>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Записаться' }));
    await signIn();
    await waitFor(() => expect(onJoin).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole('button', { name: 'Повторить запись входа' }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onJoin).toHaveBeenCalledTimes(1);
  });

  it('номер не переживает размонтирование каркаса: в новом приложении старая запись входа пуста', async () => {
    fakeApi();
    const onJoin = vi.fn();
    const withLogin = (
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="events/:id" element={<JoinButton onJoin={onJoin} />} />
          <Route
            path="login"
            element={
              <>
                <RememberState />
                <LoginPage />
              </>
            }
          />
        </Route>
      </Routes>
    );
    renderApp('/events/1', withLogin);
    await userEvent.click(await screen.findByRole('button', { name: 'Записаться' }));
    await screen.findByLabelText('Почта');
    cleanup();
    renderApp(
      ['/events/1', { pathname: '/login', search: '?next=%2Fevents%2F1', state: loginState }],
      withLogin,
    );
    await signIn('igor@demo');
    await screen.findByRole('button', { name: 'Сменить аккаунт' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onJoin).not.toHaveBeenCalled();
  });
});
