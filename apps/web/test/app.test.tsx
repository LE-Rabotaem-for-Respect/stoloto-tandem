import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, AppRoutes, createQueryClient } from '../src/App';
import { useAuthAction } from '../src/features/auth';
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
        const body = JSON.parse(String(init?.body)) as { password: string };
        if (body.password !== 'demo') {
          return json(401, { code: 'invalid_credentials', message: 'Неверная почта или пароль' });
        }
        me = anna;
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
  return { calls };
}

function renderApp(path: string, routes = <AppRoutes />) {
  return render(
    <AppProviders client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>{routes}</MemoryRouter>
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
    await userEvent.click(screen.getByRole('link', { name: 'Спорт вместе' }));
    joinVisible = true;
    await userEvent.click(await screen.findByRole('button', { name: 'Назад' }));
    await screen.findByRole('button', { name: 'Записаться' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onJoin).not.toHaveBeenCalled();
  });

  it('после смены аккаунта отложенное действие прежнего гостя не выполняется', async () => {
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
    await userEvent.type(await screen.findByLabelText('Почта'), 'anna@demo');
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
